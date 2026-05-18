#!/usr/bin/env node
// Generates all fixture CSV files needed for the death gauntlet.
// Run: node tests/fixtures/generate-fixtures.js

const fs = require('fs');
const path = require('path');
const dir = __dirname;

function write(name, content) {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8');
  console.log(`[FIXTURE] ${name} — generated`);
}

// 22 — Apollo preset
write('22-apollo-preset.csv',
`first_name,last_name,email,phone,sequence_name,step_number,email_open_count,email_click_count,reply_count,bounced,apollo_contact_id,account_id,apollo_account_id,stage,last_contacted_at,contact_stage_id,sequence_id,sequence_step_id,last_activity_date
John,Smith,john@acme.com,5551234567,Outreach Seq,1,3,1,0,false,apid001,acct001,aacc001,Active,2024-01-01,cs001,seq001,ssi001,2024-01-01
Jane,Doe,jane@acme.com,5559876543,Nurture Seq,2,1,0,1,false,apid002,acct002,aacc002,Replied,2024-01-02,cs002,seq002,ssi002,2024-01-02
`);

// 23 — Mailchimp preset
write('23-mailchimp-preset.csv',
`EMAIL,FNAME,LNAME,PHONE,UNSUB,BOUNCE,STATUS,MEMBER_RATING,OPTIN_TIME,OPTIN_IP,CONFIRM_TIME,CONFIRM_IP,LATITUDE,LONGITUDE,GMTOFF,DSTOFF,CC,REGION,LAST_CHANGED,LEID,EUID,NOTES
john@acme.com,John,Smith,5551234567,no,no,subscribed,2,2024-01-01 10:00:00,192.168.1.1,2024-01-01 10:05:00,192.168.1.1,40.7128,-74.0060,-5,1,US,NY,2024-01-15,1234,abcd,vip customer
jane@acme.com,Jane,Doe,5559876543,no,no,subscribed,3,2024-01-02 11:00:00,192.168.1.2,2024-01-02 11:05:00,192.168.1.2,37.7749,-122.4194,-8,1,US,CA,2024-01-15,5678,efgh,
`);

// 24 — Single column CSV
write('24-single-column.csv',
`email
john@acme.com
jane@acme.com
bob@acme.com
alice@acme.com
charlie@acme.com
`);

// 25 — Whitespace-only rows (greedy skips them)
write('25-whitespace-rows.csv',
`first_name,last_name,email
 , ,
	,	,
  ,,
 , ,
, ,
`);

// 26 — Tab-delimited (TSV with .csv extension — PapaParse auto-detects)
write('26-tab-delimited.csv',
"first_name\tlast_name\temail\nJohn\tSmith\tjohn@acme.com\nJane\tDoe\tjane@acme.com\nBob\tJones\tbob@acme.com\n");

// 27 — Semicolon-delimited
write('27-semicolon-delimited.csv',
`first_name;last_name;email
John;Smith;john@acme.com
Jane;Doe;jane@acme.com
Bob;Jones;bob@acme.com
`);

// 28 — Pipe-delimited
write('28-pipe-delimited.csv',
`first_name|last_name|email
John|Smith|john@acme.com
Jane|Doe|jane@acme.com
Bob|Jones|bob@acme.com
`);

// 29 — Phone format tests
write('29-phone-formats.csv',
`name,phone
10digit_no_format,5551234567
10digit_dots,555.123.4567
10digit_dashes,555-123-4567
10digit_already_formatted,(555) 123-4567
11digit_with_1,15551234567
international_uk,+44 20 7946 0958
international_france,+33 1 42 86 83 26
7digit_unchanged,123-4567
9digit_unchanged,123456789
empty_cell,
`);

// 30 — Date format tests (using 'created_date' which is in COL_MAP.date)
write('30-date-formats.csv',
`name,created_date
iso_with_z,2024-03-15T10:30:00Z
iso_with_offset,2024-03-15T10:30:00+05:30
two_digit_year_lt50,03/15/24
two_digit_year_ge50,03/15/65
unrecognized_q1,Q1 2024
unrecognized_spring,Spring 2024
unrecognized_tbd,TBD
empty_cell,
ambiguous_mmdd,03/05/2024
unambiguous_ddmm,15/03/2024
`);

// 31 — Name casing edge cases (Mc, Mac, O', hyphens)
write('31-name-casing.csv',
`first_name,last_name,email
mcdonald,mcgregor,mc1@test.com
macgregor,macdonald,mac1@test.com
o'brien,o'connor,o1@test.com
mary-jane,watson,mj@test.com
anne-marie,smith,am@test.com
`);

// 32 — Null byte test: two rows that differ only by a null byte in one field
// Note: writing actual null byte via Buffer
const nullByteContent = Buffer.concat([
  Buffer.from('id,first_name,last_name\n'),
  Buffer.from('1,John,Smith\n'),
  Buffer.from('2,John'),
  Buffer.from([0x00]), // null byte embedded in field value
  Buffer.from(',Smith\n'),
]);
fs.writeFileSync(path.join(dir, '32-null-byte.csv'), nullByteContent);
console.log('[FIXTURE] 32-null-byte.csv — generated');

// 33 — Multiple empty emails (3 empty + 2 same email)
write('33-empty-emails.csv',
`first_name,last_name,email
Alice,A,
Bob,B,
Carol,C,
Dave,D,dup@test.com
Eve,E,dup@test.com
`);

// 34 — Whitespace-only email (quoted spaces so PapaParse keeps them)
write('34-whitespace-email.csv',
`first_name,last_name,email
Alice,A,"   "
Bob,B,"   "
`);

// 35 — RFC 4180 field with embedded newline
write('35-newline-field.csv',
`first_name,last_name,notes
John,Smith,"Line one\nLine two"
Jane,Doe,Normal note
`);

// 36 — All fields are spaces
write('36-all-spaces.csv',
`first_name,last_name,email
   ,   ,
   ,   ,
`);

// 37 — Order-dependency test (whitespace + email duplicates)
write('37-order-dep.csv',
`first_name,last_name,email
John,Smith, John@ACME.COM
Jane,Doe,john@acme.com
`);

// 38 — No name columns for fuzzy test
write('38-no-name-cols.csv',
`company,revenue,employees
Acme Corp,100000,50
Beta Inc,200000,100
Gamma Ltd,300000,150
`);

// 39 — Fuzzy threshold test (John Smith vs Jon Smith vs Tom Smith)
// John+Jon: sim=0.90 > 0.85 → flagged (1 pair)
// Jon+Tom: sim=0.78 < 0.85 → not flagged
// John+Tom: sim=0.70 < 0.85 → not flagged
write('39-fuzzy-threshold.csv',
`first_name,last_name,email
John,Smith,john@acme.com
Jon,Smith,jon@acme.com
Tom,Smith,tom@acme.com
`);

// 40 — All rows duplicate of row 1
write('40-all-dups.csv',
`first_name,last_name,email
John,Smith,john@acme.com
John,Smith,john@acme.com
John,Smith,john@acme.com
John,Smith,john@acme.com
John,Smith,john@acme.com
`);

// 41 — Tab characters within field values
write('41-tab-chars.csv',
"first_name,last_name,email\n\tJohn\t,\tSmith\t,\tjohn@acme.com\t\n\tJane\t,\tDoe\t,\tjane@acme.com\t\n");

console.log('\n[DONE] All fixtures generated.');
