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
	"sort"
	"strings"

	"go.lsp.dev/protocol"
	"go.lsp.dev/uri"
	"www.velocidex.com/golang/vfilter"
)

// Symbols implements workspace/symbol - a flat search over the symbols the
// server knows about.
//
// The server keeps no persistent workspace index, so the results are drawn
// from the currently open documents plus the immutable registry:
//   - LET variables defined in open documents (with their definition
//     location),
//   - plugins and functions from the registry.
//
// The query is a case-insensitive substring match against the symbol name.
// An empty query returns all known symbols.
func (self *Server) Symbols(
	ctx context.Context, params *protocol.WorkspaceSymbolParams) (protocol.WorkspaceSymbolResult, error) {

	self.mu.Lock()
	documents := make(map[uri.URI]string, len(self.documents))
	for doc_uri, document := range self.documents {
		documents[doc_uri] = document
	}
	self.mu.Unlock()

	query := strings.ToLower(params.Query)
	symbols := []protocol.WorkspaceSymbol{}

	// LET variables from open documents.
	for doc_uri, document := range documents {
		statements, err := vfilter.MultiParseWithComments(document)
		if err != nil {
			continue
		}

		line_starts := lineStarts(document)
		mapper := positionMapper{
			document:    document,
			line_starts: line_starts,
		}

		for _, statement := range statements {
			inspection := vfilter.Inspect(statement)
			for _, let := range inspection.Lets {
				if query != "" && !strings.Contains(strings.ToLower(let.Name), query) {
					continue
				}
				symbols = append(symbols, protocol.WorkspaceSymbol{
					BaseSymbolInformation: protocol.BaseSymbolInformation{
						Name: let.Name,
						Kind: protocol.SymbolKindVariable,
					},
					Location: protocol.WorkspaceSymbolLocation(
						&protocol.Location{
							URI:   doc_uri,
							Range: mapper.rangeOf(let.Pos, let.Pos),
						}),
				})
			}
		}
	}

	// Registry callables. The registry is built once at startup and is
	// immutable after that, so we can read it without the lock. The
	// symbols carry no location - the client can resolve them with
	// workspace/symbol/resolve.
	for name, callable := range self.registry.AllCallables() {
		if query != "" && !strings.Contains(strings.ToLower(name), query) {
			continue
		}
		kind := protocol.SymbolKindFunction
		if callable.Type == "plugin" {
			kind = protocol.SymbolKindClass
		}
		symbols = append(symbols, protocol.WorkspaceSymbol{
			BaseSymbolInformation: protocol.BaseSymbolInformation{
				Name: name,
				Kind: kind,
			},
		})
	}

	sort.Slice(symbols, func(i, j int) bool {
		return symbols[i].Name < symbols[j].Name
	})

	return protocol.WorkspaceSymbolSlice(symbols), nil
}
