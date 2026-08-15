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

// References returns the locations of every occurrence of the symbol under
// the cursor within the current document.
//
// The server does not maintain a workspace index, so references are
// resolved per-document. The referenced name may be a LET variable, a bare
// symbol (dynamic column) or a plugin/function call site.
func (self *Server) References(
	ctx context.Context, params *protocol.ReferenceParams) ([]protocol.Location, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	line_starts := lineStarts(document)
	offset := positionToOffset(line_starts, params.Position)
	if offset < 0 || offset > len(document) {
		return nil, nil
	}

	name, _, _ := wordAtOffset(document, offset)
	if name == "" {
		return nil, nil
	}

	mapper := positionMapper{
		document:    document,
		line_starts: line_starts,
	}

	locations := []protocol.Location{}
	uri := params.TextDocument.URI

	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return nil, nil
	}

	for _, statement := range statements {
		inspection := vfilter.Inspect(statement)

		// The LET definition itself is a declaration, only included
		// when the client asks for it.
		if params.Context.IncludeDeclaration {
			for _, let := range inspection.Lets {
				if let.Name == name {
					locations = append(locations, protocol.Location{
						URI:   uri,
						Range: mapper.rangeOf(let.Pos, let.Pos),
					})
				}
			}
		}

		// Bare symbol references.
		for _, symbol := range inspection.Symbols {
			if symbol.Name == name {
				locations = append(locations, protocol.Location{
					URI:   uri,
					Range: mapper.rangeOf(symbol.Pos, symbol.EndPos),
				})
			}
		}

		// Call sites (plugin and function calls).
		for _, call := range inspection.Calls {
			if call.Name == name {
				locations = append(locations, protocol.Location{
					URI:   uri,
					Range: mapper.rangeOf(call.Pos, call.EndPos),
				})
			}
		}
	}

	return locations, nil
}

// wordAtOffset returns the identifier (which may be dotted, e.g.
// Artifact.Linux.Sys.Users) containing the given byte offset, together
// with its start and end offsets. Returns ("", 0, 0) when the offset is
// not inside an identifier.
func wordAtOffset(document string, offset int) (string, int, int) {
	if offset < 0 || offset > len(document) {
		return "", 0, 0
	}

	// A cursor at the very end of the document points just past the
	// last character, so back up one to find the identifier.
	if offset == len(document) {
		offset--
	}

	if !isIdentChar(document[offset]) {
		// The cursor may sit on the boundary between two tokens
		// (e.g. immediately after the last character of a word).
		if offset > 0 && isIdentChar(document[offset-1]) {
			offset--
		} else {
			return "", 0, 0
		}
	}

	start := offset
	for start > 0 && isIdentChar(document[start-1]) {
		start--
	}
	end := offset + 1
	for end < len(document) && isIdentChar(document[end]) {
		end++
	}
	return document[start:end], start, end
}

// isIdentChar reports whether c can be part of a VQL identifier. Dotted
// plugin names like Artifact.Linux.Sys.Users are treated as one word so
// references and rename cover the whole name.
func isIdentChar(c byte) bool {
	return c == '.' || c == '_' ||
		(c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
		(c >= '0' && c <= '9')
}
