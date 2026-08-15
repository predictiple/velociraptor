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
	"strings"

	"go.lsp.dev/protocol"
	"www.velocidex.com/golang/vfilter"
	"www.velocidex.com/golang/vfilter/reformat"
)

// Formatting implements textDocument/formatting.
//
// The whole document is reformatted with the VQL formatter and returned
// as a single edit covering the full range, so the client replaces the
// entire document.
func (self *Server) Formatting(
	ctx context.Context, params *protocol.DocumentFormattingParams) ([]protocol.TextEdit, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	formatted := self.formattedDocument(document)
	if formatted == "" {
		// The document could not be parsed - diagnostics will already
		// be reporting the parse error.
		return nil, nil
	}

	// Return a single edit spanning the whole document.
	return []protocol.TextEdit{
		{
			Range:   fullDocumentRange(document),
			NewText: formatted,
		},
	}, nil
}

// formattedDocument reformats the document with the VQL formatter. It
// returns an empty string if the document cannot be parsed.
func (self *Server) formattedDocument(document string) string {
	formatted, err := reformat.ReFormatVQL(
		vfilter.NewScope(), document, vfilter.DefaultFormatOptions)
	if err != nil {
		return ""
	}

	// The formatter keeps trailing newlines but may normalize the rest.
	// Trim trailing whitespace per line for cleanliness.
	lines := strings.Split(formatted, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	return strings.Join(lines, "\n")
}

// fullDocumentRange returns a range covering the entire document.
func fullDocumentRange(document string) protocol.Range {
	// The end position points just past the last line. If the document
	// ends with a newline, that is the start of the (empty) next line;
	// otherwise it is the end of the last line. An empty document is a
	// single empty line.
	lines := strings.Split(document, "\n")
	last_line := len(lines) - 1
	last_char := len(lines[last_line])
	return protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End: protocol.Position{
			Line:      uint32(last_line),
			Character: uint32(last_char),
		},
	}
}
