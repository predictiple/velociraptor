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

func TestServerFoldingRanges(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "fold.vql",
		"LET X = SELECT * FROM pslist(pid=1)\n"+
			"SELECT X FROM scope()\n")

	ranges, err := server.FoldingRanges(context.Background(), &protocol.FoldingRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
	})
	require.NoError(t, err)
	require.NotEmpty(t, ranges)

	// The LET statement spans lines 0-1 so it folds.
	assert.Equal(t, uint32(0), ranges[0].StartLine)
	assert.Equal(t, uint32(1), ranges[0].EndLine)
}

func TestServerFoldingRangesSingleLine(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "fold2.vql",
		"SELECT * FROM pslist(pid=1)\n")

	// A single-line query produces no folding ranges.
	ranges, err := server.FoldingRanges(context.Background(), &protocol.FoldingRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
	})
	require.NoError(t, err)
	assert.Empty(t, ranges)
}
