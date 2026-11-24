# Source Inventory

> **Status:** REVISION 6 (2026-11-22: independent scholar ownership, §1.6 and history H17;
> revision 5: M5.1 additions in §8 and H14–H16), **FROZEN 2026-11-20** (see
> [README.md](README.md#freeze)). Revision 5 is preserved byte-for-byte in
> [archive/SOURCE_INVENTORY.rev5.md](archive/SOURCE_INVENTORY.rev5.md); revision 4 in
> [archive/SOURCE_INVENTORY.rev4.md](archive/SOURCE_INVENTORY.rev4.md).
> **Contains no rulings.** Records Marja lifecycle evidence and where official material is
> published.
>
> **Evidence caveat:**
>
> - Entries were located with automated web search and page fetching, or supplied by the project
>   owner (marked as such).
> - A machine-generated summary is **never** authoritative: it only tells a researcher where to
>   look.
> - **No item has been human-verified yet.**
>
> **History is append-only.** Earlier evidence, statuses and classifications are never silently
> overwritten. Every change is logged in [§7](#7-evidence-and-status-history-append-only), with
> the superseded values preserved there.

## 1. Evidence model

### 1.1 Source tiers (for rulings)

| Tier | Source type                                                                                                 | Use                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | Official risalah (Tawdih al-Masa'il, Minhaj al-Salihin, or an official translation) published by the office | Primary citation                                             |
| 2    | Official istifta' answers published by the office                                                           | Primary citation. Record both if it refines Tier 1           |
| 3    | Written answer from the office or an authorized representative to our query                                 | Primary citation for that question (with permission to cite) |
| 4    | Secondary works, community booklets, third-party mirrors                                                    | Locating text only; **never** the cited authority            |

### 1.2 Source (evidence) classes

| Class            | Meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `OFFICE_OWN`     | Published by the Marja's own office or official website                             |
| `OFFICE_OTHER`   | Published by another Marja's office or an official seminary institution             |
| `STATE_OFFICIAL` | Official statement of a state body (e.g. a national judicial council or government) |
| `NEWS`           | News report. Note whether it reports an official statement                          |
| `COMMUNITY`      | Announcements by mosques, centres or community organisations; social media          |
| `REFERENCE`      | Encyclopedias and aggregators (e.g. Wikipedia). Locating only                       |
| _(tool summary)_ | AI or automated page summary. **Not evidence.** Pointer only                        |

The class describes **who published** the item. It says nothing about whether we could read it
or whether it has been checked.

### 1.3 Required fields for every evidence item

- `id` (stable, never reused), `url` (exact), `sourceClass`, `publisher`
- `publicationDate` as printed (original calendar), plus the Gregorian equivalent and conversion
  status
- `originalLanguage`, `originalTitle` (verbatim) and `translation` (with translator)
- `recordedAt`, `recordedBy` and `locatedWith` (`MANUAL` / `TOOL_ASSISTED` / `OWNER_SUPPLIED`)
- **`accessStatus`** (§1.4), **`itemAssessment`** (§1.5) and **`humanVerification`** (§1.6): three
  separate fields
- `archive` (snapshot URL + SHA-256) and `notes`

Evidence items are **never edited** after recording. The only permitted change is appending an
access, assessment, verification or archive record, with its date. Corrections are new items with
`supersedes: <id>`.

### 1.4 Source-access status (per item)

Whether the item's content can be read at its recorded location. This is recorded separately from
the source class, the assessment and human verification.

| Value                     | Meaning                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `READABLE`                | The page or file was opened and its content read at the recorded URL                                                                       |
| `ACCESS_BLOCKED`          | The URL exists or is expected, but access failed (HTTP 403, DNS failure, redirect loop, login wall). Note the failure                      |
| `NOT_FOUND`               | The URL returned "not found" (HTTP 404) or the item no longer exists at that location                                                      |
| `ARCHIVED_COPY_AVAILABLE` | The live page is not readable, but an archived copy (web archive or stored file with SHA-256) was read instead                             |
| `NOT_YET_ACCESSED`        | _Initial state, added for accuracy (needs owner approval):_ the URL was recorded from search results or a link but has not yet been opened |

Each access attempt is logged with its date and outcome. Status changes are appended, never
overwritten.

### 1.5 Item assessment (per item) and evidence confidence (per Marja)

**Item assessment** is whether the item's _content_ supports the recorded fact.

| Value          | Meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `UNASSESSED`   | Content not read (any access status other than `READABLE` or `ARCHIVED_COPY_AVAILABLE`), or not yet assessed |
| `SUPPORTING`   | Content read, and it states the recorded fact (e.g. names the deceased)                                      |
| `INCONCLUSIVE` | Content read, but it does not establish the fact (e.g. a generic condolence that names no one)               |

**Inaccessible content is never evidence.** An item whose access status is `ACCESS_BLOCKED`,
`NOT_FOUND` or `NOT_YET_ACCESSED` is always `UNASSESSED` and is **not counted**. That holds
whatever its source class, and even if it was supplied or classified by the owner.

**Evidence confidence (per Marja)** is calculated **only** from items that are `SUPPORTING` and
whose access status is `READABLE` or `ARCHIVED_COPY_AVAILABLE`:

| Value                          | Rule                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| `OFFICIAL_EVIDENCE`            | At least one counted `OFFICE_OWN`, `OFFICE_OTHER` or `STATE_OFFICIAL` item |
| `MULTIPLE_INDEPENDENT_REPORTS` | Two or more counted independent `NEWS` items; no counted official item     |
| `SINGLE_REPORT`                | One counted `NEWS`/`COMMUNITY` item                                        |
| `UNASSESSED`                   | Items are recorded, but none can be counted yet                            |
| `NO_EVIDENCE`                  | Nothing recorded                                                           |

### 1.6 Human verification (per item and per Marja status)

Whether named people have checked it. This is recorded separately from access status and
evidence confidence.

| Value       | Rule                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PENDING`   | Not yet checked                                                                                                                                                                                                                                                          |
| `IN_REVIEW` | The authorized scholar (or a person they rely on) is checking it                                                                                                                                                                                                         |
| `VERIFIED`  | The authorized scholar for that Marja read the original (live page or archived copy), archived it, and confirmed the assessment; for a Marja status, the same scholar signs. _Revision 6:_ no second person is required (earlier: "R2 read …; the approver also signed") |
| `DISPUTED`  | A problem was found; the reason is recorded                                                                                                                                                                                                                              |

An item cannot be `VERIFIED` unless its access status is `READABLE` or `ARCHIVED_COPY_AVAILABLE`.
Release gates use these fields together
([RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy)).

## 2. Marja lifecycle register

| Marja (proposed id)                                  | Lifecycle (proposed)   | Death date (as reported)                                                | Evidence confidence | Counted items    | Human verification | Next action                                                               |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ------------------- | ---------------- | ------------------ | ------------------------------------------------------------------------- |
| Sayyid Ali al-Husayni al-Sistani (`sistani`)         | Living                 | —                                                                       | `OFFICIAL_EVIDENCE` | E-SIS-1          | `PENDING`          | Human-verify and archive E-SIS-1                                          |
| Naser Makarem Shirazi (`makarem-shirazi`)            | `PENDING_VERIFICATION` | —                                                                       | `NO_EVIDENCE`       | —                | `PENDING`          | Collect a dated `OFFICE_OWN` item                                         |
| Sayyid Sadiq al-Husayni al-Shirazi (`sadiq-shirazi`) | `PENDING_VERIFICATION` | —                                                                       | `NO_EVIDENCE`       | —                | `PENDING`          | Collect a dated `OFFICE_OWN` item                                         |
| Bashir Husayn al-Najafi (`najafi`)                   | `PENDING_VERIFICATION` | —                                                                       | `NO_EVIDENCE`       | —                | `PENDING`          | Collect a dated `OFFICE_OWN` item                                         |
| Ja'far Sobhani (`sobhani`)                           | `PENDING_VERIFICATION` | —                                                                       | `NO_EVIDENCE`       | —                | `PENDING`          | Collect a dated `OFFICE_OWN` item                                         |
| Sayyid Ali Khamenei (`khamenei`)                     | Deceased               | 2026-02-28 (news, not yet counted); official item dated 11 Ramadan 1447 | `OFFICIAL_EVIDENCE` | E-KHA-1          | `PENDING`          | Human-verify E-KHA-1; open E-KHA-2…6; retrieve the leader.ir announcement |
| Muhammad Ishaq al-Fayyadh (`fayyadh`)                | Deceased               | 2026-06-04                                                              | `SINGLE_REPORT`     | E-FAY-2          | `PENDING`          | Read E-FAY-1 by hand (blocked); keep E-FAY-3 uncounted                    |
| Husayn Wahid Khorasani (`wahid-khorasani`)           | Deceased               | ~2026-11-17 (statement dated 6 Jumada al-Akhirah 1448)                  | `OFFICIAL_EVIDENCE` | E-WAH-1, E-WAH-2 | `PENDING`          | Human-verify E-WAH-1; retry E-WAH-3                                       |
| Sayyid Muhammad Sa'id al-Hakim (`hakim`)             | Deceased               | 2021-09-03                                                              | `UNASSESSED`        | —                | `PENDING`          | Only if needed for continued-taqlid research                              |
| Sayyid Muhammad Husayn Fadlallah (`fadlallah`)       | Deceased               | 2010-07-04                                                              | `UNASSESSED`        | —                | `PENDING`          | Only if needed for continued-taqlid research                              |

Notes:

- Within this inventory, Sistani is the only living candidate whose current status is supported by
  a readable statement from his own office. No status is human-verified yet.
- For the four `PENDING_VERIFICATION` candidates, earlier indirect signs (honorifics, recent office
  activity) are not evidence. They are kept in the history log.
- **Historical rulings are preserved.** A recorded death never deactivates or deletes sources,
  findings or rule packs. Whether a user may keep following a deceased Marja is the separate `CTQ`
  research topic, and the application does not decide it.

## 3. Lifecycle evidence

Abbreviations: **Access**, **Assessment**, **Human**. All items currently have human
verification `PENDING` and no archive copy.

### 3.1 Sistani — living

| ID      | URL                                             | Class        | Publisher                   | Published (as printed) | Original title (verbatim)                                                                      | Access     | Assessment   | Recorded / how            |
| ------- | ----------------------------------------------- | ------------ | --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- | ---------- | ------------ | ------------------------- |
| E-SIS-1 | https://www.sistani.org/arabic/statement/26972/ | `OFFICE_OWN` | Office of Sayyid al-Sistani | ٦-جمادى الآخرة -١٤٤٨هـ | ترجمة البيان الصادر من سماحته دام ظله بمناسبة وفاة آية الله الوحيد الخراساني (رضوان الله عليه) | `READABLE` | `SUPPORTING` | 2026-11-19, tool-assisted |

Notes: the statement is signed by him, and uses "دام ظله", the honorific for a living Marja.

### 3.2 Sayyid Ali Khamenei — deceased

| ID      | URL                                                                                                                    | Class                                            | Publisher                    | Published (as printed)      | Original title / what it reports                                             | Access             | Assessment     | Recorded / how                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------- | --------------------------- | ---------------------------------------------------------------------------- | ------------------ | -------------- | -------------------------------------------------- |
| E-KHA-1 | https://www.sistani.org/persian/statement/26954/                                                                       | `OFFICE_OTHER`                                   | Office of Sayyid al-Sistani  | ۱۱ - رمضان المبارک - ۱۴۴۷هـ | «بیانیه معظم له در پی شهادت رهبر جمهوری اسلامی ایران حضرت آیت الله خامنه ای» | `READABLE`         | `SUPPORTING`   | 2026-11-20, owner-supplied URL; tool-assisted read |
| E-KHA-2 | https://www.yahoo.com/news/articles/iran-confirms-khameneis-death-declares-061325719.html                              | `NEWS` (reports a `STATE_OFFICIAL` confirmation) | Yahoo News (wire report)     | ~2026-03-01                 | Search-result title: Iran confirms the death; 40 days of national mourning   | `NOT_YET_ACCESSED` | `UNASSESSED`   | 2026-11-19, search result                          |
| E-KHA-3 | https://www.sunstar.com.ph/network/iran-confirms-supreme-leaders-death-in-us-israeli-strikes                           | `NEWS` (reports a `STATE_OFFICIAL` confirmation) | SunStar                      | ~2026-03-01                 | Search-result title: Iran confirms the death                                 | `NOT_YET_ACCESSED` | `UNASSESSED`   | 2026-11-19, search result                          |
| E-KHA-4 | https://www.axios.com/2026/03/08/mojtaba-khamenei-iran-supreme-leader                                                  | `NEWS`                                           | Axios                        | 2026-03-08                  | Search-result title: successor named                                         | `NOT_YET_ACCESSED` | `UNASSESSED`   | 2026-11-19, search result                          |
| E-KHA-5 | https://www.pbs.org/newshour/world/mojtaba-khamenei-a-son-of-irans-late-supreme-leader-is-chosen-to-replace-his-father | `NEWS`                                           | PBS NewsHour                 | 2026-03-08                  | Search-result title: successor named                                         | `NOT_YET_ACCESSED` | `UNASSESSED`   | 2026-11-19, search result                          |
| E-KHA-6 | https://www.dawn.com/news/1981500                                                                                      | `NEWS`                                           | Dawn                         | 2026-03-12                  | Search-result title: successor's first statement                             | `NOT_YET_ACCESSED` | `UNASSESSED`   | 2026-11-19, search result                          |
| E-KHA-7 | https://www.leader.ir                                                                                                  | `OFFICE_OWN` (now the successor's office)        | Office of the Supreme Leader | —                           | Home page; the official death announcement was **not found** on it           | `READABLE`         | `INCONCLUSIVE` | 2026-11-19, tool-assisted                          |

Notes:

- E-KHA-1 names the deceased: «شهادت رهبر عالی قدر جمهوری اسلامی، حضرت آیت‌الله آقای خامنه‌ای».
- 11 Ramadan 1447 is approximately early March 2026; the conversion is to be confirmed by a human.
- The day of death (2026-02-28) comes only from news items that have not yet been opened.
- khamenei.ir: `ACCESS_BLOCKED` (DNS failure).

### 3.3 Muhammad Ishaq al-Fayyadh — deceased

| ID      | URL                                                                                                                                                              | Class                    | Publisher                        | Published (as printed) | Original title / what it reports                                                         | Access                                      | Assessment       | Recorded / how                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| E-FAY-1 | https://www.sjc.iq/view-en.79865/                                                                                                                                | `STATE_OFFICIAL`         | Supreme Judicial Council of Iraq | _not read_             | _not read_. The owner identifies it as the council's statement on his death              | **`ACCESS_BLOCKED`** (HTTP 403, 2026-11-20) | **`UNASSESSED`** | 2026-11-20, owner-supplied. **Not counted as evidence** until its content is read |
| E-FAY-2 | https://shafaq.com/en/society/Iraq-declares-three-days-of-mourning-after-death-of-Grand-Ayatollah-al-Fayyadh                                                     | `NEWS`                   | Shafaq News                      | 2026-06-04             | Death reported; Iraq declares three days of mourning                                     | `READABLE`                                  | `SUPPORTING`     | 2026-11-19, tool-assisted                                                         |
| E-FAY-3 | https://ar.alfayadh.org/2026/06/04/%d8%a7%d9%86%d8%a7-%d9%84%d9%84%d9%87-%d9%88%d8%a7%d9%86%d8%a7-%d8%a7%d9%84%d9%8a%d9%87-%d8%b1%d8%a7%d8%ac%d8%b9%d9%88%d9%86/ | `OFFICE_OWN` (candidate) | Office of al-Fayyadh             | ۱۸ ذو الحجة ۱٤٤۷       | «انا لله وانا اليه راجعون», a generic condolence formula; the deceased is not identified | `READABLE`                                  | `INCONCLUSIVE`   | 2026-11-19, tool-assisted. **Not counted** until content identifies the deceased  |

E-FAY-1 fields as specified by the owner: source class `STATE_OFFICIAL` · access status
`ACCESS_BLOCKED` · human verification `PENDING` · evidence confidence (item) `UNASSESSED`.

### 3.4 Husayn Wahid Khorasani — deceased

| ID      | URL                                             | Class                     | Publisher                   | Published (as printed) | Original title / what it reports                                  | Access                                                              | Assessment   | Recorded / how                         |
| ------- | ----------------------------------------------- | ------------------------- | --------------------------- | ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ | -------------------------------------- |
| E-WAH-1 | https://www.sistani.org/arabic/statement/26972/ | `OFFICE_OTHER`            | Office of Sayyid al-Sistani | ٦-جمادى الآخرة -١٤٤٨هـ | Official condolence statement on his death (same page as E-SIS-1) | `READABLE`                                                          | `SUPPORTING` | 2026-11-19, tool-assisted (read twice) |
| E-WAH-2 | https://www.tehrantimes.com/news/532263/        | `NEWS` (cites his office) | Tehran Times                | 2026-11-17             | "Grand Ayatollah Vahid Khorasani passes away at 105"              | `READABLE`                                                          | `SUPPORTING` | 2026-11-19, tool-assisted              |
| E-WAH-3 | https://wahidkhorasani.com                      | `OFFICE_OWN`              | His office                  | —                      | Funeral and memorial notices reported from the first fetch        | `ACCESS_BLOCKED` (DNS failure, 2026-11-20; was readable 2026-11-19) | `UNASSESSED` | 2026-11-19, tool-assisted              |

## 4. Ruling sources by candidate

Access status uses §1.4. Human verification is `PENDING` for every item.

### 4.1 Sistani (`sistani`)

| Item                                 | URL                                                        | Access             | Notes                                                                                         |
| ------------------------------------ | ---------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| Official site                        | https://www.sistani.org                                    | `READABLE`         | Arabic, Persian, Urdu, English, Azerbaijani, Turkish, French                                  |
| Risalah (EN) "Islamic Laws"          | https://www.sistani.org/english/book/48/                   | `READABLE`         | Official translation. Edition not shown; to record                                            |
| Khums chapter (EN)                   | https://www.sistani.org/english/book/48/2305/              | `READABLE`         | "Chapter Six: The One-Fifth Tax (Khums)". Rulings ~1768–1866, **inferred; must be confirmed** |
| Khums section 1 (EN)                 | https://www.sistani.org/english/book/48/2306/              | `READABLE`         | "Surplus income from earnings and gains", rulings 1769–1814 (to confirm)                      |
| Distribution of Khums (EN)           | https://www.sistani.org/english/book/48/2312/              | `NOT_YET_ACCESSED` | Seen as a link                                                                                |
| Original-language risalah (AR/FA/UR) | under https://www.sistani.org/{arabic,persian,urdu}/book/… | `NOT_YET_ACCESSED` | **Required:** the original-language text is canonical                                         |
| Istifta' — Khums (EN)                | https://www.sistani.org/english/qa/01234/                  | `NOT_YET_ACCESSED` | Seen on the Q&A index page. Previously listed as located; corrected (history H10)             |
| Question submission                  | https://www.sistani.org/english/send-question/             | `NOT_YET_ACCESSED` | Seen as a link. Previously listed as located; corrected (history H10)                         |
| I.M.A.M. Khums booklet               | https://imam-us.org/islamic-laws-of-khums/imam-foreword    | `NOT_YET_ACCESSED` | **Tier 4, `COMMUNITY`, not authoritative**                                                    |

### 4.2 Makarem Shirazi (`makarem-shirazi`) — status pending

| Item                      | URL                                                                    | Access             | Notes                                                 |
| ------------------------- | ---------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Official site             | https://makarem.ir ; languages on https://old.makarem.ir (`?lid=1` EN) | `READABLE`         | Persian main site; old-site language pages not opened |
| Risalah index (FA)        | https://makarem.ir/ahkam/fa/treatise/index                             | `READABLE`         | Khums chapter and range not yet located               |
| Rulings portal (FA)       | https://ahkam.makarem.ir/fa                                            | `READABLE`         | Individual Khums istifta' items; no category          |
| Illustrated Khums rulings | https://www.makarem.ir/pic/fa/gallery/index/54826/                     | `NOT_FOUND`        | HTTP 404                                              |
| Question / contact        | https://online.makarem.ir/ ; https://old.makarem.ir/fa/contact         | `NOT_YET_ACCESSED` |                                                       |

### 4.3 Sadiq Shirazi (`sadiq-shirazi`) — status pending

| Item                      | URL                                                                           | Access             | Notes                                            |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| Official site (FA)        | https://alshirazi.org                                                         | `READABLE`         |                                                  |
| Official site (EN)        | https://alshirazi.org/?langs=EN                                               | `ACCESS_BLOCKED`   | Redirect loop                                    |
| Former domain             | https://shirazi.ir                                                            | `ACCESS_BLOCKED`   | DNS failure                                      |
| Risalah & istifta' (FA)   | https://alshirazi.org/estefta?langs=FA                                        | `READABLE`         | No Khums category visible                        |
| Tawdih al-Masa'il         | https://alshirazi.org/library-item/70?langs=FA                                | `NOT_YET_ACCESSED` |                                                  |
| English "Islamic Law" PDF | https://alshirazi.org/data/library/pdf/14-1642797574-Islamic%20Law%20Book.pdf | `NOT_YET_ACCESSED` | Possibly a 2014 English edition (search snippet) |
| Contact / istifta form    | https://alshirazi.org/contactUsIndex?langs=FA                                 | `NOT_YET_ACCESSED` |                                                  |

### 4.4 Bashir al-Najafi (`najafi`) — status pending

| Item               | URL                                                 | Access     | Notes                                                                                         |
| ------------------ | --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| Official site (EN) | https://www.alnajafy.com/list/?la=2                 | `READABLE` |                                                                                               |
| Istifta'           | https://www.alnajafy.com/list/mainnews-2-677-0.html | `READABLE` | No Khums category found                                                                       |
| Publications       | https://www.alnajafy.com/list/mainnews-2-430-1.html | `READABLE` | Page 1 has no risalah or Khums title                                                          |
| Khums book         | _(no URL)_                                          | —          | No official location found; "100 Questions Regarding Khums" is reported by third parties only |

### 4.5 Sobhani (`sobhani`) — status pending

| Item                   | URL                                                                  | Access             | Notes                                                                                       |
| ---------------------- | -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Official site          | https://tohid.ir                                                     | `READABLE`         | Persian. Arabic version at http://imamsadeq.org (not opened)                                |
| Tawdih al-Masa'il (FA) | https://tohid.ir/fa/index/book?bookID=159&page=0                     | `READABLE`         | 11th printing, 1394 SH, Imam Sadiq Institute. Khums pp. 342–354; ruling numbers not visible |
| Arabic Khums book      | https://tohid.ir/fa/index/book?bookID=10&page=0                      | `NOT_YET_ACCESSED` |                                                                                             |
| Istifta' / contact     | https://tohid.ir/fa/index/estefta ; http://tohid.ir/fa/index/contact | `NOT_YET_ACCESSED` |                                                                                             |

### 4.6 Deceased Maraje: preserved sources (historical archive candidates; not for launch research)

| Marja           | URL                                                            | Access                                     | Notes                                                                                |
| --------------- | -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Khamenei        | https://www.leader.ir                                          | `READABLE`                                 | Now represents the successor's office; whose rulings its istifta' applies is unknown |
| Khamenei        | https://www.leader.ir/en/book/256/THE-RULLINGS-OF-KHUMS        | `READABLE`                                 | Q215–Q314, with numbering irregularities                                             |
| Khamenei        | https://www.khamenei.ir                                        | `ACCESS_BLOCKED`                           | DNS failure                                                                          |
| al-Fayyadh      | https://ar.alfayadh.org                                        | `READABLE`                                 | Arabic and Persian                                                                   |
| al-Fayyadh      | https://ar.alfayadh.org/questions_category/مسائل-في-الخمس/     | `NOT_YET_ACCESSED`                         | Khums questions category                                                             |
| Wahid Khorasani | https://wahidkhorasani.com                                     | `ACCESS_BLOCKED` (was readable 2026-11-19) | Library, Q&A and contact sub-pages not opened                                        |
| al-Hakim        | https://www.alhakeem.com                                       | `READABLE`                                 |                                                                                      |
| Fadlallah       | https://www.bayynat.org.lb ; https://www.bayynat.org.lb/faq/ar | `READABLE` ; `NOT_YET_ACCESSED`            | Q&A service appears active                                                           |

These sources are preserved. A historical ruling archive requires source verification.
Calculation would additionally require an approved rule pack and `CTQ` research
([RULE_PACK_STRUCTURE.md §3.3](RULE_PACK_STRUCTURE.md#33-release-evidence-policy)).

## 5. Launch evidence and recommendation

| Candidate       | Evidence confidence / human verification | Official Khums chapter                                      | Official Khums istifta'                | Official English | Office route               |
| --------------- | ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | ---------------- | -------------------------- |
| Sistani         | `OFFICIAL_EVIDENCE` / `PENDING`          | EN `READABLE` (range to confirm); AR/FA/UR not yet accessed | EN category recorded, not yet accessed | Yes              | Recorded, not yet accessed |
| Makarem Shirazi | `NO_EVIDENCE` / `PENDING`                | Not located                                                 | Items only                             | Old site         | Not yet accessed           |
| Sadiq Shirazi   | `NO_EVIDENCE` / `PENDING`                | Not located                                                 | No category visible                    | Blocked          | Not yet accessed           |
| Bashir Najafi   | `NO_EVIDENCE` / `PENDING`                | Not located                                                 | No category                            | Yes              | Form                       |
| Sobhani         | `NO_EVIDENCE` / `PENDING`                | FA `READABLE` (page range)                                  | Not yet accessed                       | No               | Not yet accessed           |

**Recommendation (approved in principle):** make Sistani the first implementation candidate,
because of his accessible official English Khums material. The platform remains multi-Marja.
Followers of other Maraje, including deceased Maraje, are never migrated by the application.

## 6. Open issues (Phase A)

1. Human verification and archiving of the counted lifecycle items: E-SIS-1, E-KHA-1, E-WAH-1,
   E-WAH-2, E-FAY-2.
2. **E-FAY-1 is `ACCESS_BLOCKED`** (HTTP 403). A person must read the page, from a different
   network or through an archived copy (`ARCHIVED_COPY_AVAILABLE`), and record its title, date and
   wording before it can count.
3. **E-FAY-3** stays `INCONCLUSIVE` until content identifying the deceased is found.
4. Open E-KHA-2…6 (`NOT_YET_ACCESSED`). Retrieve the leader.ir death announcement.
5. Retry the `ACCESS_BLOCKED` locations: wahidkhorasani.com, khamenei.ir, shirazi.ir, and the
   alshirazi.org English version.
6. Collect dated `OFFICE_OWN` evidence for the four `PENDING_VERIFICATION` candidates.
7. Open and verify Sistani's original-language Khums chapters, his Khums Q&A category and his
   question-submission page. Confirm ruling ranges in every language.
8. Snapshot storage and copyright decision.
9. Build a monitoring list of office update channels.

## 7. Evidence and status history (append-only)

Entries are never edited or removed. A later entry supersedes an earlier one by reference.

| #   | Date       | Rev. | Change                                                                                                                                                                                                                                                                                                                                                                  | Previous value (preserved)                                                                                                                                    | By / how                                                         |
| --- | ---------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| H1  | 2026-11-19 | 1    | First-pass inventory: candidate statuses, official URLs. Khamenei, al-Fayyadh and Wahid Khorasani reported deceased. Makarem Shirazi, Sadiq Shirazi and Bashir al-Najafi described as "living (indicated)"; Sobhani as "living as of Jul 2026 (unconfirmed)"                                                                                                            | —                                                                                                                                                             | Tool-assisted research; Sistani and Khamenei claims spot-checked |
| H2  | 2026-11-19 | 2    | Introduced evidence classes and a single combined status scale. The four indirect/unconfirmed candidates were moved to pending                                                                                                                                                                                                                                          | H1 statuses for the four candidates: "living (indicated)" ×3, "living as of Jul 2026 (unconfirmed)" ×1                                                        | Owner instruction                                                |
| H3  | 2026-11-19 | 2    | Combined-scale statuses: Sistani `OFFICIAL_LOCATED`; Khamenei `STRONGLY_REPORTED`; al-Fayyadh `REPORTED`; Wahid Khorasani `OFFICIAL_LOCATED`; four candidates `VERIFICATION_PENDING`; al-Hakim and Fadlallah `REPORTED`                                                                                                                                                 | —                                                                                                                                                             | Researcher assessment                                            |
| H4  | 2026-11-20 | 3    | Split the combined scale into evidence confidence and human verification. Mapping: `OFFICIAL_LOCATED` → `OFFICIAL_EVIDENCE` + `PENDING`; `STRONGLY_REPORTED` → `MULTIPLE_INDEPENDENT_REPORTS` + `PENDING`; `REPORTED` → `SINGLE_REPORT` + `PENDING`; `VERIFICATION_PENDING` → `NO_EVIDENCE` + `PENDING`; `CONFIRMED` retired                                            | H3 values                                                                                                                                                     | Owner instruction                                                |
| H5  | 2026-11-20 | 3    | Added E-KHA-1 (`OFFICE_OTHER`). Khamenei evidence confidence → `OFFICIAL_EVIDENCE`                                                                                                                                                                                                                                                                                      | Khamenei `MULTIPLE_INDEPENDENT_REPORTS` (H4)                                                                                                                  | Owner-supplied URL; tool-assisted read                           |
| H6  | 2026-11-20 | 3    | Added E-FAY-1 (`STATE_OFFICIAL`; fetch returned 403). al-Fayyadh evidence confidence → `OFFICIAL_EVIDENCE`. E-FAY-3 excluded until it identifies the deceased                                                                                                                                                                                                           | al-Fayyadh `SINGLE_REPORT` (H4)                                                                                                                               | Owner-supplied URL and classification                            |
| H7  | 2026-11-20 | 3    | Retained E-WAH-1 as `OFFICE_OTHER` evidence                                                                                                                                                                                                                                                                                                                             | Unchanged                                                                                                                                                     | Owner instruction                                                |
| H8  | 2026-11-20 | 3    | Assigned stable IDs to existing evidence; no content changed                                                                                                                                                                                                                                                                                                            | Items previously unnumbered                                                                                                                                   | Researcher                                                       |
| H9  | 2026-11-20 | 4    | **Added source-access status** (`READABLE`, `ACCESS_BLOCKED`, `NOT_FOUND`, `ARCHIVED_COPY_AVAILABLE`, plus initial state `NOT_YET_ACCESSED`) and per-item assessment (`UNASSESSED`, `SUPPORTING`, `INCONCLUSIVE`). Rule: inaccessible content is never counted. Added `UNASSESSED` to the per-Marja evidence-confidence scale                                           | —                                                                                                                                                             | Owner instruction                                                |
| H10 | 2026-11-20 | 4    | Access statuses assigned to every item. Corrections: Sistani "Istifta' — Khums" and "Question submission" were only seen as links, so they are `NOT_YET_ACCESSED`. E-KHA-2…6 came from search results only, so they are `NOT_YET_ACCESSED` and `UNASSESSED`                                                                                                             | Sistani's two items: "LOCATED". E-KHA-2…6: counted as `NEWS` support (H3/H5)                                                                                  | Researcher, from session records                                 |
| H11 | 2026-11-20 | 4    | **E-FAY-1:** class `STATE_OFFICIAL`, access `ACCESS_BLOCKED`, human verification `PENDING`, item evidence confidence `UNASSESSED`. Not counted. **al-Fayyadh evidence confidence → `SINGLE_REPORT`** (only E-FAY-2 counts)                                                                                                                                              | al-Fayyadh `OFFICIAL_EVIDENCE` (H6)                                                                                                                           | Owner instruction                                                |
| H12 | 2026-11-20 | 4    | Re-evaluated under H9: E-KHA-7 and E-FAY-3 `INCONCLUSIVE`; E-WAH-3 `ACCESS_BLOCKED`/`UNASSESSED`. Wahid Khorasani counted items: E-WAH-1, E-WAH-2 (confidence unchanged, `OFFICIAL_EVIDENCE`). al-Hakim and Fadlallah → `UNASSESSED`, since their death dates came from reference sources that were not recorded as items                                               | al-Hakim, Fadlallah `SINGLE_REPORT` (H4)                                                                                                                      | Researcher                                                       |
| H13 | 2026-11-20 | 4    | **Documentation frozen.** Further changes need owner approval and a new revision entry here                                                                                                                                                                                                                                                                             | —                                                                                                                                                             | Owner instruction                                                |
| H14 | 2026-11-22 | 5    | **M5 scope:** initial Marjas `sistani` and `khamenei`; the other four configured Marjas out of scope until both are scholar-approved. Khamenei's sources move from "historical archive candidates; not for launch research" (§4.6) to the initial scope, for his authentic historical Khums fatwas (§8.2). No lifecycle status, evidence item or classification changed | §4.6 heading: "not for launch research"                                                                                                                       | Owner decision (M5.1)                                            |
| H15 | 2026-11-22 | 5    | Tool-assisted HTTP reachability checks appended as access-log entries (§8.3). **No content was read and no status changed**: an HTTP 200 is not `READABLE`. khamenei.ir and its fa/en/ar subdomains failed to connect                                                                                                                                                   | —                                                                                                                                                             | Researcher (tool-assisted), 2026-11-22                           |
| H16 | 2026-11-22 | 5    | Attribution concern recorded for leader.ir (§8.2): it serves the successor's office; the library page "THE RULLINGS OF KHUMS" does not name an author in its page text, and the library lists items dated after the recorded date of death. Every item needs a source-verification record before use                                                                    | —                                                                                                                                                             | Researcher (tool-assisted), 2026-11-22                           |
| H17 | 2026-11-22 | 6    | **Independent scholar ownership:** §1.6 `VERIFIED` (and `IN_REVIEW`, `DISPUTED`) redefined: the authorized scholar for the Marja verifies and signs alone; no second researcher and no separate approver required. No evidence item, status or classification changed                                                                                                   | §1.6 `VERIFIED`: "R2 read the original (live page or archived copy), archived it, and confirmed the assessment. For a Marja status, the approver also signed" | Owner decision 2026-11-22                                        |

Older revisions of this file are also preserved in git history.

## 8. M5 initial Marjas: verification requirements and access log (revision 5)

Additions only. Nothing above is changed. **No item below has been read or human-verified.**

### 8.1 Scope

Initial Marjas: `sistani` and `khamenei` (owner decision 2026-11-22). The entries for other
candidates stay as recorded and are out of scope until both initial implementations are
scholar-approved. Every source cited for either Marja needs a
[source-verification record](templates/source-verification.template.md).

### 8.2 Khamenei: historical sources

- Scope: authentic, available historical Khums fatwas issued by Ayatollah Sayyid Ali Khamenei
  ([REVIEW_PROCESS.md §15](REVIEW_PROCESS.md)).
- **Attribution:** leader.ir now serves the successor's office (E-KHA-7). Its library page
  "THE RULLINGS OF KHUMS" (§4.6) does not name an author in its page text, and the library lists
  items such as "The Rites of Hajj 2026". Nothing from leader.ir is attributed to Khamenei without
  a source-verification record establishing authorship, edition and publication date, and, for
  anything published after the recorded date of death, verified evidence that it reproduces his
  historical rulings.
- **khamenei.ir** (his own office's site in his lifetime) is `ACCESS_BLOCKED` from the project's
  network (§3.2 notes; §8.3). Researchers may read it from another network or through archived
  copies (`ARCHIVED_COPY_AVAILABLE`), recording the snapshot date.
- **Titles to establish, not assume:** his Persian and Arabic istifta' collections and his
  educational treatise are expected to be relevant. Their exact titles, editions and the original
  language of each must be established from official sources before any is recorded as a source.
- Non-official services (for example question-answering bots or fan sites) are never sources.

### 8.3 Access log: tool-assisted reachability checks (2026-11-22)

HTTP status only. **Content not read; access status unchanged** (an HTTP 200 is not `READABLE`).

| URL                                                     | Outcome            | Current access status (unchanged) |
| ------------------------------------------------------- | ------------------ | --------------------------------- |
| https://www.khamenei.ir (and farsi., english., arabic.) | connection failure | `ACCESS_BLOCKED` (§3.2 notes)     |
| https://www.leader.ir/en/book/256/THE-RULLINGS-OF-KHUMS | HTTP 200           | `READABLE` (§4.6, as recorded)    |
| https://www.sistani.org/arabic/book/fatwa/              | HTTP 200           | `NOT_YET_ACCESSED` (new location) |
| https://www.sistani.org/persian/                        | HTTP 200           | `NOT_YET_ACCESSED` (new location) |
| https://www.sistani.org/urdu/                           | HTTP 200           | `NOT_YET_ACCESSED` (new location) |
| https://www.sistani.org/english/qa/01234/               | HTTP 200           | `NOT_YET_ACCESSED` (§4.1)         |
| https://www.sistani.org/english/send-question/          | HTTP 200           | `NOT_YET_ACCESSED` (§4.1)         |
| https://www.sistani.org/english/institute/514/          | HTTP 200           | `NOT_YET_ACCESSED` (new location) |

### 8.4 Sistani: locations to verify in Phase A

Seen in search results only (`NOT_YET_ACCESSED`, `UNASSESSED`; search snippets are not evidence):

- Arabic _Minhaj al-Salihin_ PDFs listed on the office's Arabic books page (a "corrected 1445 AH"
  edition is indicated by search results; volume and Khums page range unknown).
- Office-hosted English books "Summary of the Rules of Worship" (`/english/book/26890/`) and
  "Jurisprudence Made Easy" (`/english/book/49/`); whether either is Tier 1 or Tier 2 is for the
  scholar.
- An affiliated institution page (`/english/institute/514/`, Imam Ali Foundation, London) as a
  possible contact route; its scope must be confirmed with the office.
- A Persian _Risaleh Jami'_ attributed to the office in Mashhad, reported only by a third party
  (Tier 4); it needs an official location before any use.
