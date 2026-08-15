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

// FoldingRanges implements textDocument/foldingRange.
//
// Ranges are derived from the document outline: every LET statement and
// every SELECT query that spans multiple lines becomes a foldable region.
// The fold is placed over the statement body, excluding the keyword that
// introduces it (e.g. "LET" or "SELECT"), so that folding shows a helpful
// preview of the remainder of the line.
func (self *Server) FoldingRanges(
	ctx context.Context, params *protocol.FoldingRangeParams) ([]protocol.FoldingRange, error) {

	self.mu.Lock()
	document, pres := self.documents[params.TextDocument.URI]
	self.mu.Unlock()
	if !pres {
		return nil, nil
	}

	line_starts := lineStarts(document)

	statements, err := vfilter.MultiParseWithComments(document)
	if err != nil {
		return nil, nil
	}

	result := []protocol.FoldingRange{}
	for _, statement := range statements {
		outline := vfilter.Outline(statement)
		if outline == nil {
			continue
		}
		collectFoldingRanges(document, outline, line_starts, &result)
	}

	return result, nil
}

// collectFoldingRanges adds foldable ranges for the given outline node and
// its children.
func collectFoldingRanges(
	document string, info *vfilter.OutlineInfo,
	line_starts []int, result *[]protocol.FoldingRange) {

	// A LET statement or a query may fold if it spans multiple lines.
	if (info.Kind == vfilter.OutlineKindLet || info.Kind == vfilter.OutlineKindQuery) &&
		info.Pos.Offset > 0 && info.EndPos.Offset > info.Pos.Offset {

		start := offsetToPosition(document, line_starts, info.Pos.Offset)
		end := offsetToPosition(document, line_starts, info.EndPos.Offset)

		if end.Line > start.Line {
			// Fold the whole statement, from its first line to its
			// last line.
			*result = append(*result, protocol.FoldingRange{
				StartLine: start.Line,
				EndLine:   end.Line,
				Kind:      protocol.FoldingRangeKindRegion,
			})
		}
	}

	for _, child := range info.Children {
		collectFoldingRanges(document, child, line_starts, result)
	}
}
