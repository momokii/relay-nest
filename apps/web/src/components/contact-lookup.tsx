import type * as React from "react"

import { RecipientSelector } from "./recipient-selector"
import type { RecipientSelectorOptions } from "./recipient-selector-state"
import { Panel } from "./ui"

export function ContactLookup(options: RecipientSelectorOptions): React.JSX.Element {
  return (
    <Panel
      eyebrow="Scoped lookup"
      title="Resolve a contact"
      description="Only a validated individual target is returned; contact content is not stored in this view."
    >
      <RecipientSelector options={options} />
    </Panel>
  )
}

export {
  isContactConsentCurrent,
  isContactConsentMutationCurrent,
  isContactLookupResultCurrent,
  isContactResolutionCurrent,
  normalizedRecipient,
} from "./recipient-selector-state"
