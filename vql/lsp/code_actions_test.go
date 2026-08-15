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

func TestServerCodeActionRemoveUnknownArg(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "action.vql",
		"SELECT * FROM pslist(foo=1)")

	// Get the diagnostic for the unknown argument.
	report, err := server.Diagnostic(context.Background(), &protocol.DocumentDiagnosticParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
	})
	require.NoError(t, err)
	items := reportItems(t, report)
	require.Len(t, items, 1)

	actions, err := server.CodeAction(context.Background(), &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Range:        items[0].Range,
		Context: protocol.CodeActionContext{
			Diagnostics: items,
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, actions)

	// First action should be the "Remove argument" quick fix.
	action, ok := actions[0].(*protocol.CodeAction)
	require.True(t, ok)
	assert.Equal(t, "Remove argument 'foo'", action.Title)
	require.NotNil(t, action.Edit)
	require.NotEmpty(t, action.Edit.Changes)
	edits := action.Edit.Changes[doc_uri]
	require.Len(t, edits, 1)
	assert.Equal(t, "", edits[0].NewText)
}

func TestServerCodeActionFormatDocument(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "action2.vql",
		"SELECT * FROM pslist(pid=1)")

	actions, err := server.CodeAction(context.Background(), &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 1},
		},
		Context: protocol.CodeActionContext{
			Only: []protocol.CodeActionKind{protocol.CodeActionKindSource},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, actions)

	found := false
	for _, ca := range actions {
		action, ok := ca.(*protocol.CodeAction)
		if !ok {
			continue
		}
		if action.Title == "Format document" {
			found = true
			require.NotNil(t, action.Edit)
		}
	}
	assert.True(t, found, "expected a 'Format document' source action")
}
