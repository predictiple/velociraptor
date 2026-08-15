/*
   Velociraptor - Dig Deeper
   Copyright (C) 2019-2025 Rapid7 Inc.

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

package lsp

import (
	"context"

	"go.lsp.dev/protocol"
	"www.velocidex.com/golang/vfilter"
)

// The semantic token type legend, in the order they appear in the
// tokenTypes array advertised to the client.
const (
	tokenTypeKeyword = iota
	tokenTypeComment
	tokenTypeString
	tokenTypeNumber
	tokenTypeOperator
	tokenTypeFunction
	tokenTypePlugin
	tokenTypeVariable
	tokenTypeProperty
)

var tokenTypesLegend = []string{
	"keyword", "comment", "string", "number", "operator",
	"function", "plugin", "variable", "property",
}

// tokenModifiersLegend is intentionally empty - we do not currently
// assign modifiers to tokens.
var tokenModifiersLegend = []string{}

// SemanticTokensFull implements textDocument/semanticTokens/full.
//
// Tokens are produced by lexing the document with the vfilter tokenizer
// (so comments are visible, unlike the AST-based APIs) and then classified
// using the registry and the document's LET definitions. Position columns
// are byte-based, matching the rest of the server (UTF-8 is treated as the
// informal standard).
func (self *Server) SemanticTokensFull(
	ctx context.Context, params *protocol.SemanticTokensParams) (*protocol.SemanticTokens, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return &protocol.SemanticTokens{}, nil
	}

	tokens, err := vfilter.Tokenize(document)
	if err != nil {
		return &protocol.SemanticTokens{}, nil
	}

	line_starts := lineStarts(document)

	// LET variable names visible in this document.
	let_names := make(map[string]bool)
	for _, name := range self.letNames(document) {
		let_names[name] = true
	}

	// The full dotted names known to the registry, used to resolve
	// multi-token identifiers like Artifact.Linux.Sys.Users.
	callables := self.registry.AllCallables()

	// Encode the token stream in LSP delta format:
	// [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
	data := []uint32{}
	prev_line, prev_char := 0, 0

	for i := 0; i < len(tokens); i++ {
		tok := tokens[i]

		ttype, ok := tokenTypeFor(tok.Type)
		if !ok {
			// Not a token we color, e.g. whitespace (which is elided
			// by the lexer anyway).
			continue
		}

		pos := offsetToPosition(document, line_starts, tok.Pos.Offset)
		line := int(pos.Line)
		start_char := int(pos.Character)
		length := tok.EndPos.Offset - tok.Pos.Offset

		// Classify Ident tokens: a dotted name may span several
		// Ident tokens (e.g. Artifact . Linux . Sys), so try to match
		// the longest dotted name against the registry first.
		if tok.Type == "Ident" {
			dotted := self.longestDottedName(tokens, i)
			if callable, ok := callables[dotted]; ok {
				ttype = tokenTypeFunction
				if callable.Type == "plugin" || callable.Type == "artifact" {
					ttype = tokenTypePlugin
				}

				// Consume all the Ident tokens that make up the
				// dotted name. The '.' Operators between them are
				// skipped by the classification below.
				i += countDottedTokens(tokens, i, dotted) - 1
			} else if let_names[dotted] {
				ttype = tokenTypeVariable
			} else {
				// A bare symbol: likely a dynamic column name.
				ttype = tokenTypeProperty
			}
		} else if tok.Type == "SymbolIdent" {
			// A bare symbol in shorthand form (e.g. -Foo). Treat as
			// a variable reference.
			ttype = tokenTypeVariable
		}

		if line != prev_line {
			data = append(data,
				uint32(line), uint32(start_char),
				uint32(length), uint32(ttype), 0)
		} else {
			data = append(data,
				0, uint32(start_char-prev_char),
				uint32(length), uint32(ttype), 0)
		}

		prev_line, prev_char = line, start_char
	}

	return &protocol.SemanticTokens{Data: data}, nil
}

// tokenTypeFor maps a vfilter lexer token type name to a semantic token
// type index. Returns ok=false for tokens that carry no color.
func tokenTypeFor(token_type string) (int, bool) {
	switch token_type {
	case "Comment", "MLineComment", "VQLComment":
		return tokenTypeComment, true

	case "String", "MultilineString":
		return tokenTypeString, true

	case "Number":
		return tokenTypeNumber, true

	case "Operators":
		return tokenTypeOperator, true

	case "EXPLAIN", "SELECT", "WHERE", "AND", "OR", "AlternativeOR",
		"AlternativeAND", "FROM", "NOT", "AS", "IN", "LIMIT", "NULL",
		"DESC", "GROUPBY", "ORDERBY", "BOOL", "LET":
		return tokenTypeKeyword, true

	case "Ident", "SymbolIdent":
		// Classified by the caller using the registry and LET scope.
		return tokenTypeProperty, true
	}
	return 0, false
}

// longestDottedName assembles the longest dotted identifier starting at
// tokens[i] and returns it as a single string.
func (self *Server) longestDottedName(tokens []vfilter.Token, i int) string {
	var b []byte
	for j := i; j < len(tokens); j++ {
		if tokens[j].Type != "Ident" && tokens[j].Type != "SymbolIdent" {
			break
		}
		b = append(b, tokens[j].Value...)

		// A dotted name continues only when the next token is a '.'
		// operator followed by an Ident.
		if j+1 < len(tokens) &&
			tokens[j+1].Type == "Operators" &&
			tokens[j+1].Value == "." &&
			j+2 < len(tokens) &&
			tokens[j+2].Type == "Ident" {

			b = append(b, '.')
			j++
		} else {
			break
		}
	}
	return string(b)
}

// countDottedTokens returns the number of Ident tokens that make up a
// dotted name beginning at tokens[i]. For "Artifact.Linux.Sys.Users"
// the count is 4 (Artifact, Linux, Sys, Users). The '.' operator
// tokens between them are not counted.
func countDottedTokens(tokens []vfilter.Token, i int, dotted string) int {
	// Count the Ident tokens until we have consumed the full name.
	consumed := 0
	n := 0
	for j := i; j < len(tokens) && consumed < len(dotted); j++ {
		if tokens[j].Type == "Ident" {
			n++
			consumed += len(tokens[j].Value)
			if consumed >= len(dotted) {
				break
			}
		}
	}
	return n
}
