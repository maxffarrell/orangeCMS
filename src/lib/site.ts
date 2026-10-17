/** Public presentation defaults. Replace this module in a consumer overlay. */
export const site = {
 name: 'orangeCMS',
 adminName: 'orangeCMS',
 mcpName: 'orangeCMS',
 emailSenderName: 'orangeCMS Forms',
 tokenPrefix: 'oc_',
 canonicalHost: '',
 aliasHosts: [] as string[],
 description: 'A configurable content website.',
 logo: '',
 footerText: '',
 labels: { home: 'Home', services: 'Services', tours: 'Listings', vendors: 'Partners', about: 'About', forms: 'Forms', contact: 'Contact', privacy: 'Privacy' },
 listingAction: 'Continue',
 formPrivacyNotice: 'Read the privacy policy before submitting personal information.',
 navigation: [
  { path: '/', label: 'Home', footer_label: 'Home' },
  { path: '/services', label: 'Services', footer_label: 'Services' },
  { path: '/tours', label: 'Listings', footer_label: 'Listings' },
  { path: '/vendors', label: 'Partners', footer_label: 'Partners' },
  { path: '/about', label: 'About', footer_label: 'About' },
  { path: '/forms', label: 'Forms', footer_label: 'Forms' },
  { path: '/contact', label: 'Contact', footer_label: 'Contact' }
 ]
};
