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
	"go.lsp.dev/uri"
)

// openDocument is a test helper that opens a document and returns its URI.
func openDocument(t *testing.T, server *Server, name string, text string) uri.URI {
	t.Helper()
	doc_uri := uri.MustParse("file:///tmp/" + name)
	require.NoError(t, server.DidOpen(context.Background(), &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    text,
			Version: 1,
		},
	}))
	return doc_uri
}

// sigAt returns the signature help at the given line/character.
func sigAt(t *testing.T, server *Server, doc_uri uri.URI, line, char uint32) *protocol.SignatureHelp {
	t.Helper()
	result, err := server.SignatureHelp(context.Background(), &protocol.SignatureHelpParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: doc_uri},
			Position:     protocol.Position{Line: line, Character: char},
		},
	})
	require.NoError(t, err)
	return result
}

func TestServerSignatureHelpFunction(t *testing.T) {
	server, _ := newTestServer()
	ctx := context.Background()

	doc_uri := uri.MustParse("file:///tmp/sig.vql")
	document := "SELECT upcase(str='x') FROM pslist(pid=1)"
	require.NoError(t, server.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    document,
			Version: 1,
		},
	}))

	// Cursor inside the parens of upcase: after "upcase(" at char 13.
	result := sigAt(t, server, doc_uri, 0, 14)
	require.NotNil(t, result)
	require.Len(t, result.Signatures, 1)
	sig := result.Signatures[0]
	assert.Contains(t, sig.Label, "upcase")
	assert.Contains(t, sig.Label, "str")
	assert.NotNil(t, result.ActiveSignature)
	assert.Equal(t, uint32(0), *result.ActiveSignature)
	require.NotNil(t, result.ActiveParameter)
	param, ok := result.ActiveParameter.Get()
	require.True(t, ok)
	assert.Equal(t, uint32(0), param)
}

func TestServerSignatureHelpPlugin(t *testing.T) {
	server, _ := newTestServer()
	ctx := context.Background()

	doc_uri := uri.MustParse("file:///tmp/sig2.vql")
	document := "SELECT upcase(str='x') FROM pslist(pid=1)"
	require.NoError(t, server.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    document,
			Version: 1,
		},
	}))

	// Cursor inside pslist's parens.
	result := sigAt(t, server, doc_uri, 0, 34)
	require.NotNil(t, result)
	require.Len(t, result.Signatures, 1)
	assert.Contains(t, result.Signatures[0].Label, "pslist")
	assert.Contains(t, result.Signatures[0].Label, "pid")
}

func TestServerSignatureHelpOutsideCall(t *testing.T) {
	server, _ := newTestServer()
	ctx := context.Background()

	doc_uri := uri.MustParse("file:///tmp/sig3.vql")
	document := "SELECT upcase(str='x') FROM pslist()"
	require.NoError(t, server.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:     doc_uri,
			Text:    document,
			Version: 1,
		},
	}))

	// Cursor on 'SELECT' - not inside any call, so no signature help.
	result := sigAt(t, server, doc_uri, 0, 1)
	assert.Nil(t, result)
}
