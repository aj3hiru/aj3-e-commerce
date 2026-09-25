-- Campaign Offer → "Show on homepage": template, headline, colour (JSON), shown above "Products For You".
ALTER TABLE ecom_campaigns ADD COLUMN home_display JSON NULL AFTER is_paused;
