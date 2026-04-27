export type ParsedDrawioDiagram = {
  xml: string
  sourceFormat: 'drawio' | 'legacy' | 'empty'
}

export function createEmptyDrawioDiagramXml() {
  return [
    '<mxfile host="Home Suite Home">',
    '  <diagram id="page-1" name="Page-1">',
    '    <mxGraphModel dx="1432" dy="646" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
  ].join('\n')
}

export function parseDrawioDiagramXml(value: string): ParsedDrawioDiagram {
  const raw = value.trim()
  if (!raw) {
    return {
      xml: createEmptyDrawioDiagramXml(),
      sourceFormat: 'empty',
    }
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(raw, 'application/xml')
  if (parsed.querySelector('parsererror')) {
    return {
      xml: createEmptyDrawioDiagramXml(),
      sourceFormat: 'legacy',
    }
  }

  const root = parsed.documentElement
  if (root.nodeName === 'mxfile' || root.nodeName === 'mxGraphModel') {
    return {
      xml: raw,
      sourceFormat: 'drawio',
    }
  }

  return {
    xml: createEmptyDrawioDiagramXml(),
    sourceFormat: 'legacy',
  }
}
