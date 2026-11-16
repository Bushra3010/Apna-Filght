-- =====================================================================
-- Migration 0003: reference data (countries, Indian states with GST
-- state codes, major cities, airlines). Safe to re-run.
-- =====================================================================

insert into countries (code, name, dial_code) values
  ('IN','India','+91'), ('AE','United Arab Emirates','+971'), ('SA','Saudi Arabia','+966'),
  ('QA','Qatar','+974'), ('OM','Oman','+968'), ('BH','Bahrain','+973'), ('KW','Kuwait','+965'),
  ('SG','Singapore','+65'), ('MY','Malaysia','+60'), ('TH','Thailand','+66'), ('ID','Indonesia','+62'),
  ('VN','Vietnam','+84'), ('LK','Sri Lanka','+94'), ('NP','Nepal','+977'), ('BT','Bhutan','+975'),
  ('MV','Maldives','+960'), ('BD','Bangladesh','+880'), ('GB','United Kingdom','+44'),
  ('US','United States','+1'), ('CA','Canada','+1'), ('AU','Australia','+61'), ('NZ','New Zealand','+64'),
  ('FR','France','+33'), ('DE','Germany','+49'), ('IT','Italy','+39'), ('CH','Switzerland','+41'),
  ('NL','Netherlands','+31'), ('ES','Spain','+34'), ('TR','Turkey','+90'), ('JP','Japan','+81'),
  ('CN','China','+86'), ('HK','Hong Kong','+852'), ('KR','South Korea','+82'), ('EG','Egypt','+20'),
  ('ZA','South Africa','+27'), ('KE','Kenya','+254'), ('MU','Mauritius','+230'), ('AZ','Azerbaijan','+994'),
  ('GE','Georgia','+995'), ('KZ','Kazakhstan','+7'), ('RU','Russia','+7')
on conflict (code) do nothing;

-- GST state codes (GSTIN digits 1–2)
insert into states (country_code, name, gst_code) values
  ('IN','Jammu and Kashmir','01'), ('IN','Himachal Pradesh','02'), ('IN','Punjab','03'),
  ('IN','Chandigarh','04'), ('IN','Uttarakhand','05'), ('IN','Haryana','06'), ('IN','Delhi','07'),
  ('IN','Rajasthan','08'), ('IN','Uttar Pradesh','09'), ('IN','Bihar','10'), ('IN','Sikkim','11'),
  ('IN','Arunachal Pradesh','12'), ('IN','Nagaland','13'), ('IN','Manipur','14'), ('IN','Mizoram','15'),
  ('IN','Tripura','16'), ('IN','Meghalaya','17'), ('IN','Assam','18'), ('IN','West Bengal','19'),
  ('IN','Jharkhand','20'), ('IN','Odisha','21'), ('IN','Chhattisgarh','22'), ('IN','Madhya Pradesh','23'),
  ('IN','Gujarat','24'), ('IN','Dadra and Nagar Haveli and Daman and Diu','26'), ('IN','Maharashtra','27'),
  ('IN','Karnataka','29'), ('IN','Goa','30'), ('IN','Lakshadweep','31'), ('IN','Kerala','32'),
  ('IN','Tamil Nadu','33'), ('IN','Puducherry','34'), ('IN','Andaman and Nicobar Islands','35'),
  ('IN','Telangana','36'), ('IN','Andhra Pradesh','37'), ('IN','Ladakh','38'), ('IN','Other Territory','97')
on conflict (gst_code) do nothing;

insert into cities (country_code, state_id, name)
select 'IN', s.id, c.name
from (values
  ('07','New Delhi'), ('27','Mumbai'), ('27','Pune'), ('27','Nagpur'), ('29','Bengaluru'),
  ('33','Chennai'), ('36','Hyderabad'), ('19','Kolkata'), ('24','Ahmedabad'), ('24','Surat'),
  ('08','Jaipur'), ('08','Udaipur'), ('09','Lucknow'), ('09','Varanasi'), ('09','Agra'),
  ('10','Patna'), ('20','Ranchi'), ('21','Bhubaneswar'), ('23','Indore'), ('23','Bhopal'),
  ('03','Amritsar'), ('04','Chandigarh'), ('02','Shimla'), ('02','Manali'), ('05','Dehradun'),
  ('01','Srinagar'), ('38','Leh'), ('18','Guwahati'), ('11','Gangtok'), ('30','Goa'),
  ('32','Kochi'), ('32','Thiruvananthapuram'), ('29','Mangaluru'), ('33','Coimbatore'),
  ('33','Madurai'), ('37','Visakhapatnam'), ('35','Port Blair'), ('22','Raipur'), ('06','Gurugram'),
  ('09','Noida')
) as c(code, name)
join states s on s.gst_code = c.code
on conflict (country_code, state_id, name) do nothing;

insert into cities (country_code, state_id, name)
select x.cc, null, x.name from (values
  ('AE','Dubai'), ('AE','Abu Dhabi'), ('SA','Jeddah'), ('SA','Riyadh'), ('SA','Makkah'), ('SA','Madinah'),
  ('QA','Doha'), ('OM','Muscat'), ('SG','Singapore'), ('MY','Kuala Lumpur'), ('TH','Bangkok'),
  ('TH','Phuket'), ('ID','Bali'), ('VN','Hanoi'), ('LK','Colombo'), ('NP','Kathmandu'),
  ('MV','Male'), ('GB','London'), ('US','New York'), ('FR','Paris'), ('CH','Zurich'), ('TR','Istanbul'),
  ('AZ','Baku'), ('GE','Tbilisi'), ('MU','Port Louis')
) as x(cc, name)
where not exists (select 1 from cities c where c.country_code = x.cc and c.state_id is null and c.name = x.name);

insert into airlines (org_id, code, name)
select null, x.code, x.name from (values
  ('6E','IndiGo'), ('AI','Air India'), ('IX','Air India Express'), ('QP','Akasa Air'), ('SG','SpiceJet'),
  ('9I','Alliance Air'), ('EK','Emirates'), ('QR','Qatar Airways'), ('EY','Etihad Airways'),
  ('G9','Air Arabia'), ('FZ','flydubai'), ('WY','Oman Air'), ('GF','Gulf Air'), ('SV','Saudia'),
  ('SQ','Singapore Airlines'), ('TR','Scoot'), ('MH','Malaysia Airlines'), ('AK','AirAsia'),
  ('TG','Thai Airways'), ('UL','SriLankan Airlines'), ('BA','British Airways'), ('LH','Lufthansa'),
  ('AF','Air France'), ('KL','KLM'), ('TK','Turkish Airlines'), ('CX','Cathay Pacific'),
  ('UA','United Airlines'), ('AA','American Airlines'), ('VS','Virgin Atlantic'), ('KU','Kuwait Airways')
) as x(code, name)
where not exists (select 1 from airlines a where a.org_id is null and a.code = x.code);
