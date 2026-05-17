declare module 'react-cytoscapejs' {
  import type cytoscape from 'cytoscape'
  import type { CSSProperties } from 'react'

  interface CytoscapeComponentProps {
    elements:   cytoscape.ElementDefinition[]
    stylesheet?: cytoscape.StylesheetCSS[]
    layout?:    cytoscape.LayoutOptions
    style?:     CSSProperties
    cy?:        (cy: cytoscape.Core) => void
    className?: string
  }

  const CytoscapeComponent: React.FC<CytoscapeComponentProps>
  export default CytoscapeComponent
}
