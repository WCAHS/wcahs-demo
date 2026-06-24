-- Site settings (extracted from current hardcoded content)
INSERT OR REPLACE INTO site_settings (key, value) VALUES
  ('phone', '(507) 201-7287'),
  ('email', 'info@wcahs.org'),
  ('address', 'Waseca, MN 56093'),
  ('address_note', 'Foster-based — no public facility'),
  ('facebook_url', 'https://facebook.com/WasecaCAHS/'),
  ('partners', '["Tractor Supply Co.", "Pet Expo Mankato"]'),
  ('announcement_enabled', 'false'),
  ('announcement_text', ''),
  ('mission_text', 'The Waseca County Animal Humane Society is a <strong>No-Kill 501(c)(3) nonprofit</strong> composed of individuals from our community and beyond, who have come together to be the voice for those who cannot speak for themselves.'),
  ('mission_text_2', 'We independently serve southern Minnesota through community funding — we do not receive county support. Every dollar comes from people like you who believe every animal deserves a chance.'),
  ('mission_text_3', 'Rather than maintaining a traditional shelter, <strong>all our animals live in foster homes</strong> where they receive personalized attention, socialization, and love while they wait for their forever families.'),
  ('why_foster_home', 'Animals recover and thrive in a real home, not a kennel. Foster families provide the individual attention each animal needs.'),
  ('why_foster_matches', 'Foster families know each animal''s personality, quirks, and needs — so we can match you with the perfect companion.'),
  ('why_foster_costs', 'Without building overhead, more of every donated dollar goes directly to veterinary care, food, and supplies for the animals.');

-- FAQ entries (extracted from current faq.html)
INSERT INTO faq (section, question, answer, sort_order) VALUES
  ('adoption', 'How do I adopt an animal from WCAHS?', 'Browse our <a href="pets.html" class="text-sage-600 underline">adoptable pets</a>, then contact us to fill out an adoption application. Our board reviews every application to ensure the best match. Once approved, you''ll meet the animal at their foster home before finalizing.', 1),
  ('adoption', 'What are the adoption fees?', 'Fees vary by animal and cover spaying/neutering, vaccinations, microchipping, and any medical care received. Qualifying seniors receive 50% off through our Pets for Seniors program. Contact us for specific fees.', 2),
  ('adoption', 'What are the requirements to adopt?', 'All existing pets in your home must be current on vaccinations and spayed/neutered. Adopted pets must live primarily indoors. A background check is required. Our board reviews every application individually.', 3),
  ('adoption', 'Can I meet the animal before adopting?', 'Absolutely! Once your application is approved, we arrange a meet and greet at the animal''s foster home. This lets you see how the animal behaves in a home environment and make sure it''s a good fit for your family.', 4),
  ('fostering', 'What does fostering involve?', 'You provide a safe, loving home for an animal until they find their forever family. WCAHS covers all costs — food, supplies, and veterinary care. You provide the love, socialization, and a safe space.', 1),
  ('fostering', 'How long do I foster an animal?', 'It depends on the animal. Some find homes within a few weeks, others may take a few months. We work with you on timing and never pressure foster families. You can also choose to foster short-term for specific situations.', 2),
  ('fostering', 'Can I adopt the animal I''m fostering?', 'Yes! We call them "foster fails" and we love them. If you bond with your foster animal and want to make it permanent, you''ll go through the standard adoption process with priority consideration.', 3),
  ('general', 'Do you have a physical shelter?', 'No. WCAHS is 100% foster-based. All of our animals live in volunteer foster homes throughout the Waseca area. This means every animal gets individualized care and attention in a real home environment.', 1),
  ('general', 'How is WCAHS funded?', 'We''re entirely community funded. We do not receive any county or government support. Every dollar comes from donations, fundraisers, and adoption fees. 100% of funds go directly to animal care.', 2),
  ('general', 'I found a stray animal. What should I do?', 'Check our <a href="lost-found.html" class="text-sage-600 underline">Lost &amp; Found</a> page first to see if anyone is looking for the animal. Then contact us at <a href="tel:5072017287" class="text-sage-600 underline">(507) 201-7287</a>. If you can safely contain the animal, keep it in a secure area until we can help coordinate next steps.', 3),
  ('general', 'What is the Barn Cat Program?', 'Our Barn Cat Program places community cats as working mousers on farms, barns, warehouses, and rural properties — natural, chemical-free pest control. Every cat is spayed/neutered and vaccinated (rabies &amp; distemper). We require a minimum of 2–3 cats per location to help them settle in. You provide food, water, and basic shelter. Free-will donation, $25 per cat recommended. <a href="contact.html" class="text-sage-600 underline">Contact us</a> to learn more.', 4);
