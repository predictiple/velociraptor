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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.lsp.dev/protocol"
)

func TestServerWorkspaceSymbolsLET(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "ws.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"LET Y = SELECT * FROM scope()\n")

	result, err := server.Symbols(context.Background(), &protocol.WorkspaceSymbolParams{
		Query: "X",
	})
	require.NoError(t, err)
	require.NotNil(t, result)

	symbols, ok := result.(protocol.WorkspaceSymbolSlice)
	require.True(t, ok, "expected WorkspaceSymbolSlice")

	// X matches; Y does not. The registry contributes pslist only if it
	// contains 'X' (it does not). So at least one result: X.
	found_x := false
	for _, symbol := range symbols {
		if symbol.Name == "X" {
			found_x = true
			assert.Equal(t, protocol.SymbolKindVariable, symbol.Kind)
			loc, ok := symbol.Location.(*protocol.Location)
			require.True(t, ok)
			assert.Equal(t, doc_uri, loc.URI)
		}
	}
	assert.True(t, found_x, "expected LET variable X in workspace symbols")
}

func TestServerWorkspaceSymbolsRegistry(t *testing.T) {
	server, _ := newTestServer()

	// Search the registry for 'upcase'.
	result, err := server.Symbols(context.Background(), &protocol.WorkspaceSymbolParams{
		Query: "upcase",
	})
	require.NoError(t, err)
	require.NotNil(t, result)

	symbols, ok := result.(protocol.WorkspaceSymbolSlice)
	require.True(t, ok)

	found := false
	for _, symbol := range symbols {
		if symbol.Name == "upcase" {
			found = true
			assert.Equal(t, protocol.SymbolKindFunction, symbol.Kind)
		}
	}
	assert.True(t, found, "expected 'upcase' in workspace symbols")
}
