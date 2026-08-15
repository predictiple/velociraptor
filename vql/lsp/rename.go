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
	"go.lsp.dev/uri"
	"www.velocidex.com/golang/vfilter"
)

// PrepareRename reports whether the symbol under the cursor can be renamed
// and, if so, returns the range of its identifier.
//
// Rename is only offered for LET variables and bare symbols. Plugin and
// function names come from the registry and must not be renamed as that
// would silently break resolution.
func (self *Server) PrepareRename(
	ctx context.Context, params *protocol.PrepareRenameParams) (protocol.PrepareRenameResult, error) {

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

	name, start, end := wordAtOffset(document, offset)
	if name == "" || !self.renameableName(document, name) {
		return nil, nil
	}

	return &protocol.Range{
		Start: offsetToPosition(document, line_starts, start),
		End:   offsetToPosition(document, line_starts, end),
	}, nil
}

// Rename renames the symbol under the cursor everywhere it occurs in the
// current document.
//
// Like PrepareRename, only LET variables and bare symbols are renameable -
// registry plugins and functions are excluded. The document is re-parsed
// so the returned edits are fresh even if the client did not call
// PrepareRename first.
func (self *Server) Rename(
	ctx context.Context, params *protocol.RenameParams) (*protocol.WorkspaceEdit, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres || params.NewName == "" {
		return nil, nil
	}

	line_starts := lineStarts(document)
	offset := positionToOffset(line_starts, params.Position)
	if offset < 0 || offset > len(document) {
		return nil, nil
	}

	name, _, _ := wordAtOffset(document, offset)
	if name == "" || !self.renameableName(document, name) {
		return nil, nil
	}

	mapper := positionMapper{
		document:    document,
		line_starts: line_starts,
	}

	edits := []protocol.TextEdit{}

	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return nil, nil
	}

	for _, statement := range statements {
		inspection := vfilter.Inspect(statement)

		// The LET definition.
		for _, let := range inspection.Lets {
			if let.Name == name {
				edits = append(edits, protocol.TextEdit{
					Range:   mapper.rangeOf(let.Pos, let.Pos),
					NewText: params.NewName,
				})
			}
		}

		// Bare symbol references.
		for _, symbol := range inspection.Symbols {
			if symbol.Name == name {
				edits = append(edits, protocol.TextEdit{
					Range:   mapper.rangeOf(symbol.Pos, symbol.EndPos),
					NewText: params.NewName,
				})
			}
		}

		// Call sites. Only included when the name is not a registry
		// callable (renameableName already guarantees this), which
		// covers e.g. LET-bound plugin aliases.
		for _, call := range inspection.Calls {
			if call.Name == name {
				edits = append(edits, protocol.TextEdit{
					Range:   mapper.rangeOf(call.Pos, call.EndPos),
					NewText: params.NewName,
				})
			}
		}
	}

	if len(edits) == 0 {
		return nil, nil
	}

	return &protocol.WorkspaceEdit{
		Changes: map[uri.URI][]protocol.TextEdit{
			params.TextDocument.URI: edits,
		},
	}, nil
}

// renameableName reports whether the given identifier may be renamed.
// Registry plugins and functions are excluded because renaming them would
// break resolution against the registry.
func (self *Server) renameableName(document string, name string) bool {
	if _, pres := self.registry.AllCallables()[name]; pres {
		return false
	}

	// Must actually appear in the document as a LET or symbol.
	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return false
	}
	for _, statement := range statements {
		inspection := vfilter.Inspect(statement)
		for _, let := range inspection.Lets {
			if let.Name == name {
				return true
			}
		}
		for _, symbol := range inspection.Symbols {
			if symbol.Name == name {
				return true
			}
		}
	}
	return false
}
