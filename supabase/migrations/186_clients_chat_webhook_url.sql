-- Add Google Chat incoming webhook URL per client.
-- Used for real-time post-review notifications (comment/changes_requested
-- → immediate post; approved → only when every post in the calendar is
-- approved). Read by lib/chat/post-to-google-chat.ts.

alter table clients
  add column if not exists chat_webhook_url text;

comment on column clients.chat_webhook_url is
  'Google Chat incoming webhook URL for per-client comment notifications. Format: https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...';

-- Seed from Jack's 2026-04-28 webhook list. Three groups share a webhook
-- (multi-brand spaces): custom-shade + all-shutters; dunstons + crystal-creek;
-- fusion + varsity. Nativz internal social webhook is handled outside the
-- clients table (no client row).
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAwl6lDak/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=qKA5423Wv5FWRcWc_3-ide-EosKKKbP6-KsvjG9p1ZI' where slug = 'total-plumbing';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAr1nqagM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=1i8aTdyGiSKzVxq6RcWfj82gKrdoWrWTwkZBNF4nZVg' where slug = 'kumon';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQA4bBHPCk/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Ju7x-W8c9qTswSFpf4y2KAIQQp6n8VJrKCZ-Z9khwoE' where slug = 'hartley-law';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAEFZ_A4s/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=dPgWOBhk8qMZhK-dNzN5Qt5VoIKtfrHddA-hCIttZUA' where slug = 'coast-to-coast';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAiO7EzpM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lWaunFrWFSj3AezOYRG73xXX5d-UmLKEf551kXBY8r0' where slug in ('custom-shade-and-shutter', 'all-shutters-and-blinds');
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQATDDndeE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=4vPt27HlsGJ-MZibC_JJJoH6IE1zcRacBrJrP5siqZI' where slug = 'skibell-fine-jewelry';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAmAiRnus/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=eeys8bm1GNFU9vpHsYm43rvQU6nkKGOtXHSgRLhoIuc' where slug = 'owings-auto';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAqc_BaJ0/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=0W6hzw9NpeY4lXqW5bZaH50tamZIjkObd005s3sfnTQ' where slug = 'goodier-labs';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAQuIj4CY/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=UOl_M4DRCVKBChGgI_hbyaVEFBaf67uMagdSOuux0Zg' where slug = 'college-hunks-hauling-junk';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAqyh2tFk/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=H00RA9EYgVNf7xH_Vg-5LArClULPr4cryYBbwun5VzM' where slug = 'bit-bunker';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQA1shoV5E/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=ERCKtn3bx1ia6AKOm2G0aRW4FoX7cLodmdOALEcTRjg' where slug = 'ecoview';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAZUljuN0/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=NUHB9Lm9zsVqJstxDnGlYyTZjLhZKs5uF6bQkofNIzw' where slug = 'rana-furniture';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAtlQnoLE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=dJqAPxxM3ZJ_0l-xhaPNSv9_8idt7lnJUokYwWK8oMI' where slug = 'equidad-homes';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAsXg1ur4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=wONJ58Y7PXRssv_jBM8fqjC6HnKzKumc5-seWrHfCaw' where slug in ('dunstons-steakhouse', 'crystal-creek-cattle');
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAc6Q9NVA/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Z1pXHAc-ptyCbPlUPFh2h7pktNvicMwtW4u1mNVPa2E' where slug in ('fusion-brands', 'varsity-vault');
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAkYmrn3E/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=-OsP6-lNgUnJ7FmHlgmm1HyLpeM8n9mOaceFohZx3nM' where slug = 'goldback';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAwuHYPXw/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=tm0oJBituSNL5jiaEuKTp-K2ueh9FwnBdtEnJetlRM8' where slug = 'jamnola';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAcaEyTNI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=gLIVExdBW8ZDDuYf7zmiTVdm_Hlcl8L16nrceo0wgco' where slug = 'weston-funding';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAdf7tfYk/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=7t2tSYVc4quMBumJvug9gMZYy3M-0T4GT9ySLXnG6mI' where slug = 'the-standard-ranch-water';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAmZaEq9g/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=t7ZDTksmqDvK5tk7L2W5mXMucxubKfYsHafGnxJ7Mjc' where slug = 'avondale-private-lending';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAsLSAMso/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=h9tmq0Ct8Q3uaRZB7m_2Oxoneg0_mLwLZJ3y01r-04c' where slug = 'stealth-health-containers';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAXWIRbdE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Cc2oaE2-ZRoBYUAkt-Ee_DH25Qe8O1BTnpNbni4A7w8' where slug = 'safe-stop';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAM7g2uW8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=rww-VDT34wYqxZPiEl2X7_L1I4xKvLoWa4ilwPIJuMM' where slug = 'toastique';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQApAlnSW8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=_DqGMu_QMNwLpFqsZJZZ8HxOoL-jqsylua6cR8AxNMM' where slug = 'national-lenders';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAbaYfJ4g/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lDstcBEluwSCsXuW6hGulVPA8ktxwwF1fu4zUxUzkKI' where slug = 'rank-prompt';
update clients set chat_webhook_url = 'https://chat.googleapis.com/v1/spaces/AAQAT_nzy3g/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=3_PTAuMs04hMg-_EDJVdE9bR3yoni8zdNNhNLHa6SDY' where slug = 'landshark-vodka-seltzer';
