import type { DialogueScript } from '../systems/dialogue';

export const SIGNS: Record<string, DialogueScript> = {
  'sign-welcome': {
    lines: ['WELCOME TO NUSSSTADT — twinned with Berlin. Mind the trams and the placeholders.'],
  },
  'sign-tower': {
    lines: ['The Nusssehturm. Berlin’s tower is taller. This one is nuttier.'],
  },
  'sign-placeholder': {
    lines: ['In this city everyone starts as XX. That’s not an insult. It’s a draft.'],
  },
  'sign-reviews': {
    lines: ['REVIEWS WANTED: minimum two. Bring snacks.'],
  },
  'sign-rfc2119': {
    lines: ['RFC 2119: MUST means must. SHOULD means should. MAY means good luck.'],
  },
  'sign-proof': {
    lines: ['A proof is a promise from the mint. Like a hat-check ticket for sats.'],
  },
  'sign-blind': {
    lines: ['The mint signs what it cannot see. That’s the blind part.'],
  },
  'sign-swap': {
    lines: ['NUT-03: SWAP. Break a big nut into small ones without losing the meat.'],
  },
  'sign-two-impls': {
    lines: ['Two implementations, then merge. Not before.'],
  },
  'sign-trash-hint': {
    lines: ['People lose seeds in the trash. Check anyway?'],
  },
  'sign-kimi-hint': {
    lines: ['Kimi was seen near the old red line.'],
  },
  'sign-canal': {
    lines: ['The Spree doesn’t take ecash yet. The bridge does.'],
  },
  'sign-u-bahn': {
    lines: ['U-BAHN: red line CLOSED. (No, you can’t go in. ...Yet.)'],
  },
  'sign-mint-info': {
    lines: ['NUT-06: MINT INFO. Ask the mint who it is before you trust it with lunch money.'],
  },
  'sign-chalkboard': {
    lines: ["CHALKBOARD: '1. Open an issue. 2. MUST get reviews. 3. SHOULD test implementations. 4. MAY celebrate.'"],
  },
  'sign-lab-shelf': {
    lines: ["SHELF: 'Blind Signatures for Beginners' · 'Why Not Ed25519 (a thriller)' · 'RFC 2119: The Musical'"],
  },
  'sign-pos': {
    lines: ["It's a Numo POS terminal. You tapped and paid for your espresso with ecash!"],
  },
  'sign-cafe-menu': {
    lines: ['MENU: espresso 3,000 msat · oat latte 4,500 msat · refill if you bring a proof'],
  },
  'sign-cafe-wifi': {
    lines: ['FREE WI-FI. Password is the preimage.'],
  },
  'sign-hq-reception': {
    lines: ['RECEPTION: sign in please. We track lost tokens and lost causes.'],
  },
  'sign-hq-motd': {
    lines: ["MINT MOTD: 'migrated'. That’s it. That’s the message."],
  },
  'sign-hq-beta': {
    lines: ['NOTICE: the mint is BETA and best-effort, no guarantees. Small amounts only.'],
  },
  'sign-workshop-crates': {
    lines: ["CDK CRATES: 'handle with care · proofs inside · do not shake'"],
  },
  'sign-workshop-swap': {
    lines: ['SWAP STATION: give big, get small. No fees. No refunds. No small talk.'],
  },
  'sign-palm-coconuts': {
    lines: ['Coconuts are just nuts with better marketing.'],
  },
  'sign-palm-types': {
    lines: ["cashu-ts README: 'bring your own storage'. The plants bring their own soil."],
  },
  'sign-library-shh': {
    lines: ['SHHH. The shells are thinking.'],
  },
  'sign-library-nutshell': {
    lines: ['NUTSHELL (n.): the part of the docs everyone skips. Pip didn’t.'],
  },
  'sign-club-tonight': {
    lines: ['TONIGHT: DJ MAC. B-side missing. Reward offered.'],
  },
  'sign-club-cover': {
    lines: ['COVER: 10 sats. Cloakroom takes ecash. Bouncer takes names.'],
  },
  'sign-hideout-wanted': {
    lines: ['If you can read this, Kimi wanted you to find it.'],
  },
  'sign-hideout-htlc': {
    lines: ['NUT-14: HTLC. Find the secret or lose the sats. Kimi’s idea of a good time.'],
  },
};

export const SIGN_TOTAL = Object.keys(SIGNS).length;
