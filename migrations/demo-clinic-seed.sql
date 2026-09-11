-- DEMO DATA ONLY. Every last name is "Testdata" so these are unmistakable and
-- easy to remove in one statement:
--   DELETE FROM clinic_registrations WHERE owner_last = 'Testdata';

INSERT INTO clinic_registrations
 (event_id, owner_first, owner_last, owner_name, email, phone_cell, phone_home,
  address, city, state, zip, pets, pet_count, cat_count, dog_count,
  hardship, notes, status, waitlisted, auto_reason, staff_notes)
VALUES
-- Straightforward, eligible, awaiting a decision
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Jamie','Testdata','Jamie Testdata','jamie@example.com','(507) 555-0143','(507) 555-0199',
 '412 Elm St','Waseca','MN','56093',
 '[{"name":"Bruno","species":"Dog","sex":"Male","breed":"Shepherd mix","color1":"Black","color2":"Tan","age_years":4,"age_months":3,"weight":55,"shots":"Yes","health":"Limps on left rear leg in cold weather","services":["Rabies vaccine","Microchip"]},
   {"name":"Pip","species":"Dog","sex":"Female","breed":"Chihuahua","color1":"Fawn","color2":"","age_years":2,"age_months":0,"weight":11,"shots":"No","health":"","services":["Rabies vaccine","Combo vaccine"]},
   {"name":"Milo","species":"Cat","sex":"Male","breed":"Domestic Shorthair","color1":"Orange","color2":"White","age_years":2,"age_months":6,"weight":9,"shots":"Yes","health":"","services":["Rabies vaccine","Flea/tick prevention"]}]',
 3,1,2,
 'We took in my late mother''s two pets this spring and things have been tight since.',
 'Bruno is nervous with strangers — happy to hold him myself at check-in.',
 'applied',0,NULL,NULL),

-- Already approved, with a scheduling note
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Dana','Testdata','Dana Testdata','dana@example.com','(507) 555-0288',NULL,
 '9 Oak Ave','Waterville','MN','56096',
 '[{"name":"Tank","species":"Dog","sex":"Male","breed":"Labrador","color1":"Yellow","color2":"","age_years":6,"age_months":0,"weight":88,"shots":"Yes","health":"","services":["Rabies vaccine"]},
   {"name":"Nala","species":"Dog","sex":"Female","breed":"Great Dane","color1":"Grey","color2":"","age_years":3,"age_months":0,"weight":120,"shots":"Not sure","health":"Very strong on a leash","services":["Rabies vaccine","Dewormer"]}]',
 2,0,2,NULL,NULL,'approved',0,NULL,'Called 9/10 — checking in at 9am, bringing both in one crate run.'),

-- Approved, three cats
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Sam','Testdata','Sam Testdata','sam@example.com','(507) 555-0311','(507) 555-0312',
 '55 Lake Rd','Elysian','MN','56028',
 '[{"name":"Sock","species":"Cat","sex":"Female","breed":"Domestic Medium Hair","color1":"Black","color2":"White","age_years":1,"age_months":2,"weight":7,"shots":"No","health":"","services":["Rabies vaccine","Combo vaccine"]},
   {"name":"Dot","species":"Cat","sex":"Female","breed":"Domestic Shorthair","color1":"Calico","color2":"","age_years":0,"age_months":8,"weight":5,"shots":"No","health":"Smallest of the litter","services":["Rabies vaccine"]},
   {"name":"Gus","species":"Cat","sex":"Male","breed":"Domestic Shorthair","color1":"Grey","color2":"","age_years":5,"age_months":0,"weight":12,"shots":"Yes","health":"","services":["Rabies vaccine","Microchip","Flea/tick prevention"]}]',
 3,3,0,NULL,'All three are indoor only.','approved',0,NULL,NULL),

-- On the waiting list: applied after the spots filled
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Alex','Testdata','Alex Testdata','alex@example.com','(507) 555-0455',NULL,
 '77 Third St','Janesville','MN','56048',
 '[{"name":"Juno","species":"Cat","sex":"Female","breed":"Domestic Shorthair","color1":"Tortoiseshell","color2":"","age_years":3,"age_months":0,"weight":8,"shots":"Yes","health":"","services":["Rabies vaccine"]},
   {"name":"Pepper","species":"Cat","sex":"Male","breed":"Domestic Shorthair","color1":"Black","color2":"","age_years":1,"age_months":6,"weight":10,"shots":"Not sure","health":"","services":["Rabies vaccine","Combo vaccine"]}]',
 2,2,0,NULL,NULL,'applied',1,'Applied after cat spots filled (25/25)',NULL),

-- Ineligible: one pet, with a situation worth reading
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Marty','Testdata','Marty Testdata','marty@example.com','(507) 555-0500','(507) 555-0501',
 '18 River St','Waseca','MN','56093',
 '[{"name":"Biscuit","species":"Cat","sex":"Female","breed":"Domestic Longhair","color1":"Cream","color2":"","age_years":2,"age_months":0,"weight":9,"shots":"No","health":"","services":["Rabies vaccine","Combo vaccine"]}]',
 1,1,0,
 'She''s my only pet. I''m on a fixed income and the regular clinic price is out of reach for me right now. I''d be grateful for any help.',
 NULL,'ineligible',0,'Only one animal in the household',NULL),

-- Ineligible: outside the sponsored communities
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Robin','Testdata','Robin Testdata','robin@example.com','(507) 555-0620',NULL,
 '300 Hill Dr','Mankato','MN','56001',
 '[{"name":"Scout","species":"Dog","sex":"Male","breed":"Beagle","color1":"Tricolor","color2":"","age_years":5,"age_months":0,"weight":28,"shots":"Yes","health":"","services":["Rabies vaccine"]},
   {"name":"Willow","species":"Dog","sex":"Female","breed":"Terrier mix","color1":"White","color2":"Brown","age_years":2,"age_months":4,"weight":22,"shots":"Yes","health":"","services":["Rabies vaccine"]}]',
 2,0,2,
 'I know I''m outside the listed towns — my daughter lives in Waseca and I could ride with her if that helps.',
 NULL,'ineligible',0,'Outside the sponsored communities (Mankato)',NULL),

-- Cancelled
((SELECT id FROM events WHERE form_key='clinic' ORDER BY date DESC LIMIT 1),
 'Chris','Testdata','Chris Testdata','chris@example.com','(507) 555-0777',NULL,
 '6 Pine Ct','Waterville','MN','56096',
 '[{"name":"Rex","species":"Dog","sex":"Male","breed":"Boxer","color1":"Brindle","color2":"","age_years":3,"age_months":0,"weight":62,"shots":"Yes","health":"","services":["Rabies vaccine"]},
   {"name":"Ash","species":"Cat","sex":"Female","breed":"Domestic Shorthair","color1":"Grey","color2":"White","age_years":4,"age_months":0,"weight":8,"shots":"Yes","health":"","services":["Rabies vaccine"]}]',
 2,1,1,NULL,NULL,'cancelled',0,NULL,'Called 9/11 — had them done at their own vet, freeing up the spots.');
