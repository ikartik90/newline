// The icon set imports as React components (vite-plugin-svgr, `include:
// "**/*.svg"`). Declared against the icons' own path rather than bare `*.svg`
// so this pattern outranks `vite/client`'s, which types an svg as a URL string.
declare module '@/assets/icons/*.svg' {
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>
  export default ReactComponent
}
