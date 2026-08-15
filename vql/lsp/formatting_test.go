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

func TestServerFormatting(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "fmt.vql",
		"SELECT * FROM pslist(pid=1) WHERE Name =~ 'foo'")

	edits, err := server.Formatting(context.Background(), &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Options: protocol.FormattingOptions{
			TabSize:      4,
			InsertSpaces: true,
		},
	})
	require.NoError(t, err)
	require.Len(t, edits, 1)
	assert.NotEmpty(t, edits[0].NewText)
	assert.Equal(t, uint32(0), edits[0].Range.Start.Line)
	assert.Equal(t, uint32(0), edits[0].Range.Start.Character)
}

func TestServerFormattingBadDocument(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "fmt2.vql", "SELECT * FROM pslist(")

	// An unparseable document cannot be formatted; no edits.
	edits, err := server.Formatting(context.Background(), &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Options: protocol.FormattingOptions{
			TabSize:      4,
			InsertSpaces: true,
		},
	})
	require.NoError(t, err)
	assert.Empty(t, edits)
}
