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
	"www.velocidex.com/golang/vfilter"
)

// InlayHint implements textDocument/inlayHint.
//
// VQL requires keyword arguments (positional arguments do not parse), so
// the classic "parameter name before positional arg" hint cannot fire.
// Instead the server renders type hints: after each keyword argument's
// value it shows the declared parameter type, e.g. `pid=1000 · int`.
//
// The type is resolved from the registry for the enclosing call. Args of
// free-form callables and args whose type is unknown are skipped.
func (self *Server) InlayHint(
	ctx context.Context, params *protocol.InlayHintParams) ([]protocol.InlayHint, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	line_starts := lineStarts(document)

	// The client may request hints for a specific range; the default is
	// the whole document.
	rng := params.Range
	if rng == (protocol.Range{}) {
		rng = fullDocumentRange(document)
	}

	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return nil, nil
	}

	result := []protocol.InlayHint{}
	for _, statement := range statements {
		inspection := vfilter.Inspect(statement)

		for _, call := range inspection.Calls {
			// Resolve the callable to learn the parameter types.
			var callable *Callable
			var pres bool
			if call.IsPlugin {
				callable, pres = self.registry.GetPlugin(call.Name)
			} else {
				callable, pres = self.registry.GetFunction(call.Name)
			}
			if !pres || callable.FreeForm {
				continue
			}

			// Map parameter types by name.
			types := make(map[string]string, len(callable.Args))
			for _, param := range callable.Args {
				types[param.Name] = param.Type
			}

			for _, arg := range call.Args {
				if arg.Pos.Offset <= 0 {
					continue
				}
				arg_type, ok := types[arg.Name]
				if !ok || arg_type == "" {
					continue
				}

				// Place the hint just past the end of the
				// argument expression.
				hint_pos := offsetToPosition(
					document, line_starts, arg.EndPos.Offset)
				if !rangeContains(rng, hint_pos) {
					continue
				}

				result = append(result, protocol.InlayHint{
					Position: hint_pos,
					Label: protocol.InlayHintLabel(
						protocol.String("· " + arg_type)),
					Kind: protocol.InlayHintKindType,
				})
			}
		}
	}

	return result, nil
}

// rangeContains reports whether an LSP position lies inside a range.
func rangeContains(rng protocol.Range, pos protocol.Position) bool {
	if pos.Line < rng.Start.Line || pos.Line > rng.End.Line {
		return false
	}
	if pos.Line == rng.Start.Line && pos.Character < rng.Start.Character {
		return false
	}
	if pos.Line == rng.End.Line && pos.Character > rng.End.Character {
		return false
	}
	return true
}
