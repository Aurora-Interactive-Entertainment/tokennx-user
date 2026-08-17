import { Prism } from 'prism-react-renderer'

// Prism language components extend the shared global instance when imported.
;(globalThis as typeof globalThis & { Prism: typeof Prism }).Prism = Prism

await import('prismjs/components/prism-bash')

export { Prism }
