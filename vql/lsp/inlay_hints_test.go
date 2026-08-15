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

func TestServerInlayHints(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "hints.vql",
		"SELECT upcase(str='x') FROM pslist(pid=1)")

	hints, err := server.InlayHint(context.Background(), &protocol.InlayHintParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Range:        protocol.Range{},
	})
	require.NoError(t, err)
	require.NotEmpty(t, hints)

	// upcase(str=...) gets a type hint for 'str' = string; pslist(pid=...)
	// gets a type hint for 'pid' = int.
	labels := []string{}
	for _, hint := range hints {
		label, ok := hint.Label.(protocol.String)
		require.True(t, ok)
		labels = append(labels, string(label))
	}
	assert.Contains(t, labels, "· string")
	assert.Contains(t, labels, "· int")
}

func TestServerInlayHintsEmptyRangeReturnsAll(t *testing.T) {
	server, _ := newTestServer()
	doc_uri := openDocument(t, server, "hints2.vql",
		"SELECT upcase(str='x') FROM pslist(pid=1)")

	// An explicit empty range behaves like "whole document".
	hints, err := server.InlayHint(context.Background(), &protocol.InlayHintParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
		Range:        protocol.Range{},
	})
	require.NoError(t, err)
	require.NotEmpty(t, hints)
}
