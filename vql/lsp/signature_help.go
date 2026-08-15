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
	"www.velocidex.com/golang/vfilter"
)

// SignatureHelp returns the signature of the call enclosing the cursor.
//
// The active call is found by inspecting the AST for the call whose
// argument list contains the cursor position. The active parameter is
// the argument at the cursor, counting keyword and positional arguments
// alike.
func (self *Server) SignatureHelp(
	ctx context.Context, params *protocol.SignatureHelpParams) (*protocol.SignatureHelp, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	line_starts := lineStarts(document)
	offset := positionToOffset(line_starts, params.Position)

	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return nil, nil
	}

	for _, statement := range statements {
		inspection := vfilter.Inspect(statement)

		for _, call := range inspection.Calls {
			if !containsOffset(call.Pos, call.EndPos, offset) {
				continue
			}

			// Resolve the callable.
			var callable *Callable
			var pres bool
			if call.IsPlugin {
				callable, pres = self.registry.GetPlugin(call.Name)
			} else {
				callable, pres = self.registry.GetFunction(call.Name)
			}

			// The call is enclosing the cursor but the callable is
			// unknown - there is nothing useful to show.
			if !pres {
				return &protocol.SignatureHelp{}, nil
			}

			// Compute the active parameter: the last argument whose
			// name starts before the cursor. Arguments that start
			// after the cursor are not yet "active".
			active_param := 0
			for i, arg := range call.Args {
				if arg.Pos.Offset > 0 && arg.Pos.Offset <= offset {
					active_param = i
				}
			}

			// Build the signature label: name(arg1, arg2, ...).
			params_list := make([]string, 0, len(callable.Args))
			for _, arg := range callable.Args {
				if arg.Type == "" {
					params_list = append(params_list, arg.Name)
				} else {
					params_list = append(params_list,
						fmt.Sprintf("%s: %s", arg.Name, arg.Type))
				}
			}
			label := fmt.Sprintf("%s(%s)", call.Name, strings.Join(params_list, ", "))

			sig_params := make([]protocol.ParameterInformation, 0,
				len(callable.Args))
			for _, arg := range callable.Args {
				sig_params = append(sig_params, protocol.ParameterInformation{
					Label: protocol.ParameterInformationLabel(
						protocol.String(fmt.Sprintf("%s: %s", arg.Name, arg.Type))),
				})
			}

			signature := protocol.SignatureInformation{
				Label:      label,
				Parameters: sig_params,
			}
			if callable.Doc != "" {
				signature.Documentation = protocol.InlayHintTooltip(
					protocol.String(callable.Doc))
			}

			active_value := uint32(active_param)
			active := protocol.NewNullable(active_value)
			return &protocol.SignatureHelp{
				Signatures:      []protocol.SignatureInformation{signature},
				ActiveSignature: &active_value,
				ActiveParameter: active,
			}, nil
		}
	}

	return nil, nil
}
