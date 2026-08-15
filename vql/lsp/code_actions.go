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
	"fmt"
	"strings"

	"go.lsp.dev/protocol"
	"go.lsp.dev/uri"
)

// CodeAction implements textDocument/codeAction.
//
// Two kinds of actions are offered:
//
//   - Quick fixes for the "Unknown argument" diagnostic: delete the
//     offending keyword argument from the call.
//   - A "Format document" source action that reformats the whole
//     document using the VQL formatter.
//
// The actions returned depend on the diagnostics associated with the
// context range: the client passes the diagnostics it has already
// computed for the range, and only those are turned into fixes.
func (self *Server) CodeAction(
	ctx context.Context, params *protocol.CodeActionParams) ([]protocol.CommandOrCodeAction, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	actions := []protocol.CommandOrCodeAction{}

	// Quick fixes derived from the diagnostics in the requested range.
	for _, diag := range params.Context.Diagnostics {
		msg := diagnosticMessage(diag)
		if !strings.HasPrefix(msg, "Unknown argument '") {
			continue
		}

		// Extract the argument name from the diagnostic message.
		rest := strings.TrimPrefix(msg, "Unknown argument '")
		arg_name, _, ok := strings.Cut(rest, "'")
		if !ok {
			continue
		}

		// Delete the argument: replace the diagnostic range with an
		// empty string. The range of the diagnostic covers the whole
		// keyword argument (name and value), which is exactly what we
		// want to remove. The trailing comma (if any) is left for the
		// user or formatter to clean up, since computing its extent is
		// fragile.
		action := &protocol.CodeAction{
			Title: "Remove argument '" + arg_name + "'",
			Kind:  ptr(protocol.CodeActionKindQuickFix),
			Diagnostics: []protocol.Diagnostic{diag},
			IsPreferred: ptr(true),
			Edit: &protocol.WorkspaceEdit{
				Changes: map[uri.URI][]protocol.TextEdit{
					params.TextDocument.URI: {
						{
							Range:   diag.Range,
							NewText: "",
						},
					},
				},
			},
		}
		actions = append(actions, protocol.CommandOrCodeAction(action))
	}

	// A source action to format the document. Only offered when the
	// client asks for source actions, to keep the menu clean.
	if actionKindRequested(params, protocol.CodeActionKindSource) {
		format_action := &protocol.CodeAction{
			Title: "Format document",
			Kind:  ptr(protocol.CodeActionKindSource),
			Edit: &protocol.WorkspaceEdit{
				Changes: map[uri.URI][]protocol.TextEdit{
					params.TextDocument.URI: {
						{
							Range:   fullDocumentRange(document),
							NewText: self.formattedDocument(document),
						},
					},
				},
			},
		}
		actions = append(actions, protocol.CommandOrCodeAction(format_action))
	}

	return actions, nil
}

// diagnosticMessage extracts the plain string from a diagnostic message.
func diagnosticMessage(diag protocol.Diagnostic) string {
	switch msg := diag.Message.(type) {
	case protocol.String:
		return string(msg)
	default:
		return fmt.Sprintf("%v", msg)
	}
}

// actionKindRequested reports whether the client's code action context
// asks for the given kind (or the empty filter which means "all").
func actionKindRequested(params *protocol.CodeActionParams, kind protocol.CodeActionKind) bool {
	// Only filter when the client provided an explicit list of kinds.
	only := params.Context.Only
	if len(only) == 0 {
		return true
	}
	for _, k := range only {
		if k == kind || strings.HasPrefix(string(k), string(kind)+".") {
			return true
		}
	}
	return false
}
