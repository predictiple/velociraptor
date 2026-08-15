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

func TestServerReferencesLET(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "refs.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"SELECT X FROM scope()\n")

	// Cursor on the LET definition name 'X' at line 0, char 4.
	locations, err := server.References(context.Background(), &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 0, Character: 4},
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: true},
	})
	require.NoError(t, err)

	// Definition (line 0) + reference (line 1).
	require.Len(t, locations, 2)
	assert.Equal(t, doc_uri, locations[0].URI)
}

func TestServerReferencesExcludeDeclaration(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "refs2.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"SELECT X FROM scope()\n")

	// Cursor on the reference at line 1, char 7.
	locations, err := server.References(context.Background(), &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 1, Character: 7},
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: false},
	})
	require.NoError(t, err)

	// Only the reference itself, not the declaration.
	require.Len(t, locations, 1)
}

func TestServerPrepareRenameLET(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "rename.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"SELECT X FROM scope()\n")

	// Cursor on the LET definition.
	result, err := server.PrepareRename(context.Background(), &protocol.PrepareRenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 0, Character: 4},
		},
	})
	require.NoError(t, err)

	rng, ok := result.(*protocol.Range)
	require.True(t, ok, "expected a *protocol.Range")
	assert.Equal(t, uint32(0), rng.Start.Line)
	assert.Equal(t, uint32(4), rng.Start.Character)
	assert.Equal(t, uint32(0), rng.End.Line)
	assert.Equal(t, uint32(5), rng.End.Character)
}

func TestServerPrepareRenameRegistryPluginRejected(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "rename2.vql",
		"SELECT * FROM pslist(pid=1)\n")

	// Cursor on the plugin name 'pslist' - registry symbols are not
	// renameable.
	result, err := server.PrepareRename(context.Background(), &protocol.PrepareRenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 0, Character: 14},
		},
	})
	require.NoError(t, err)
	assert.Nil(t, result)
}

func TestServerRenameLET(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "rename3.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"SELECT X FROM scope()\n")

	// Rename X to Y from the definition site.
	edit, err := server.Rename(context.Background(), &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 0, Character: 4},
		},
		NewName: "Y",
	})
	require.NoError(t, err)
	require.NotNil(t, edit)

	edits, pres := edit.Changes[doc_uri]
	require.True(t, pres)
	require.Len(t, edits, 2)
	for _, te := range edits {
		assert.Equal(t, "Y", te.NewText)
	}
}

func TestServerRenameRegistryPluginRejected(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "rename4.vql",
		"SELECT * FROM pslist(pid=1)\n")

	// Renaming a registry plugin is not allowed.
	edit, err := server.Rename(context.Background(), &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: 0, Character: 14},
		},
		NewName: "pslist2",
	})
	require.NoError(t, err)
	assert.Nil(t, edit)
}
