// Shared Markdown configuration for rendering user-visible content.
// react-markdown does NOT sanitize by default: `javascript:`, `data:` and
// other dangerous URL schemes in links/images survive the pipeline and can
// execute when clicked. All Markdown we render (product/service bios) is
// therefore piped through rehype-sanitize with the schema below.
import rehypeSanitize from 'rehype-sanitize'
import { defaultSchema } from 'hast-util-sanitize'

export const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Tailwind typography (`.prose`) is applied on the container, but keep
    // harmless class names just in case content uses them.
    '*': [...(defaultSchema.attributes['*'] || []), 'className'],
    // remark-gfm task lists render checkboxes; allow the safe subset.
    input: [...(defaultSchema.attributes.input || []), 'type', 'checked', 'disabled'],
  },
  protocols: {
    ...defaultSchema.protocols,
    // Allow only web/mail links on anchors (relatives stay allowed because
    // they carry no protocol).
    href: ['http', 'https', 'mailto'],
  },
}

export { rehypeSanitize }
