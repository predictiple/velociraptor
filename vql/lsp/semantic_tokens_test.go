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
	"testing"

	"github.com/stretchr/testify/require"
	"go.lsp.dev/protocol"
	"go.lsp.dev/uri"
)

// decodeTokens decodes the delta-encoded semantic token data into a flat
// list of [line, startChar, length, typeIndex] records for assertions.
func decodeTokens(data []uint32) [][4]uint32 {
	result := [][4]uint32{}
	var line, start uint32
	for i := 0; i+4 < len(data); i += 5 {
		deltaLine := data[i]
		if deltaLine > 0 {
			start = 0
		}
		line += deltaLine
		start += data[i+1]
		result = append(result, [4]uint32{line, start, data[i+2], data[i+3]})
	}
	return result
}

func TestServerSemanticTokens(t *testing.T) {
	server, _ := newTestServer()
	ctx := context.Background()

	doc_uri := uri.MustParse("file:///tmp/tokens.vql")
	document := "LET X = upcase(str='hi') FROM pslist(pid=1) WHERE Name = 'x'"
	require.NoError(t, server.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    document,
			Version: 1,
		},
	}))

	result, err := server.SemanticTokensFull(ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotEmpty(t, result.Data)

	tokens := decodeTokens(result.Data)
	require.NotEmpty(t, tokens)

	// Build a map of token type -> names found for loose assertions.
	// Data rows are [line, startChar, length, typeIndex].
	var had_let, had_string, had_number bool
	for _, tok := range tokens {
		kind := tokenTypesLegend[tok[3]]
		switch kind {
		case "keyword":
			had_let = true
		case "string":
			had_string = true
		case "number":
			had_number = true
		}
	}
	require.True(t, had_let, "expected a keyword token (LET)")
	require.True(t, had_string, "expected a string token")
	require.True(t, had_number, "expected a number token")
}

func TestServerSemanticTokensClassifyCallables(t *testing.T) {
	server, _ := newTestServer()
	ctx := context.Background()

	doc_uri := uri.MustParse("file:///tmp/tokens2.vql")
	document := "SELECT upcase(str='x') FROM pslist(pid=1)"
	require.NoError(t, server.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    document,
			Version: 1,
		},
	}))

	result, err := server.SemanticTokensFull(ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
	})
	require.NoError(t, err)

	tokens := decodeTokens(result.Data)

	// Find the 'upcase' and 'pslist' identifiers by scanning the original
	// text positions.
	var upcase_kind, pslist_kind string
	for _, tok := range tokens {
		text := document // simplified: single-line document, so line 0
		_ = text
		start := int(tok[1])
		end := start + int(tok[2])
		word := document[start:end]
		switch word {
		case "upcase":
			upcase_kind = tokenTypesLegend[tok[3]]
		case "pslist":
			pslist_kind = tokenTypesLegend[tok[3]]
		}
	}
	require.Equal(t, "function", upcase_kind, "upcase should be a function")
	require.Equal(t, "plugin", pslist_kind, "pslist should be a plugin")
}
