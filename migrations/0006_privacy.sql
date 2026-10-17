-- Privacy policy is intentionally an outline to be completed by the owner.
-- Form schemas and consent text are configured per site, never seeded with customer data.
INSERT OR IGNORE INTO pages (slug, title, eyebrow, subtitle, content) VALUES
('privacy', 'Privacy Policy', 'Legal', 'Information about how this site handles personal data.',
'Configure this page before collecting personal information. Describe your organization, contact details, the data you collect and why, service providers, retention period, and the rights available to your users. Ensure this policy reflects your actual practices.');
INSERT OR IGNORE INTO settings (key, value) VALUES ('submission_retention_days', '365');
