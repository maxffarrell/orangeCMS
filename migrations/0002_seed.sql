-- Neutral starter content. Site content belongs in a consumer overlay or the CMS.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('phone', ''), ('email', ''), ('address', ''), ('memberships', '');
INSERT OR IGNORE INTO pages (slug, title, eyebrow, subtitle, content) VALUES
  ('home', 'Welcome', 'Your website', 'Make this site your own.', 'Edit your pages, listings, forms, partners and contact details in the CMS.'),
  ('about', 'About', 'Our story', 'Introduce your organization.', 'Add your own story here.'),
  ('services', 'Services', 'What we do', 'Describe your services.', 'Add your services here.'),
  ('events', 'Events', 'Upcoming', 'Discover upcoming events.', 'Add your upcoming events here.'),
  ('forms', 'Forms', 'Get in touch', 'Complete a form online or download a document.', 'Published forms appear below.'),
  ('tours', 'Listings', 'Explore', 'Discover our latest listings.', 'Add listings in the CMS.'),
  ('vendors', 'Partners', 'Our network', 'Meet our partners.', 'Add partners in the CMS.'),
  ('contact', 'Contact', 'Get in touch', 'We would love to hear from you.', 'Use the contact details configured by the site owner.');
