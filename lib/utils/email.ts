/**
 * @deprecated This logic has moved to the shared `@hygienhub/order-emails`
 * package (a sibling-repo `file:` dependency pointing at
 * hygienhub-store/packages/order-emails) so it isn't duplicated between
 * this admin dashboard and the storefront.
 *
 * Nothing in this repo imports from here anymore — kept only as a
 * compatibility re-export in case something still points at
 * '@/lib/utils/email'. Safe to delete once you've confirmed that.
 */
export * from '@hygienhub/order-emails'
