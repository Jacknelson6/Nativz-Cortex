-- Align kandy_templates.vertical with app AD_VERTICALS + legacy export values.

ALTER TABLE kandy_templates DROP CONSTRAINT IF EXISTS kandy_templates_vertical_check;

ALTER TABLE kandy_templates ADD CONSTRAINT kandy_templates_vertical_check CHECK (
  vertical IN (
    'general',
    'ecommerce',
    'saas',
    'local_service',
    'health_wellness',
    'finance',
    'education',
    'real_estate',
    'food_beverage',
    'fashion',
    'automotive',
    'health_beauty',
    'digital_products'
  )
);
