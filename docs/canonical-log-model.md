# Canonical Log Entry Model

Based on N3FJP Field Day ARRL-FD contest format, a QSO (contact/log entry) contains:

## Core Contact Info
- **call**: Remote station callsign (FLDCALL)
- **band**: HF band (FLDBAND): 10, 15, 20, 40, 80, etc.
- **mode**: Operating mode (FLDMODE): PH (SSB), CW, DIG (Digital)
- **date**: Date of contact (FLDDATESTR): YYYY/MM/DD
- **time**: Time of contact (FLDTIMEONSTR): HH:MM:SS

## Location/Context
- **continent**: Continent (FLDCONTINENT): NA, EU, AS, etc.
- **country**: Country worked (FLDCOUNTRYWORKED): USA, etc.
- **dxcc**: DXCC country number (FLDCOUNTRYDXCC): numeric
- **cq_zone**: CQ zone (FLDCQZONE): 01-40
- **itu_zone**: ITU zone (FLDITUZONE): 01-90
- **section**: ARRL section (FLDSECTION): OR, CA, etc.
- **state**: State (FLDSTATE): OR, CA, etc.

## Station/Operator Info
- **station**: Home station callsign (FLDSTATION): N7UF
- **operator**: Operator callsign (FLDOPERATOR): N7UF
- **class**: Station class for contest (FLDCLASS): 1H (1 operator, HQ), etc.
- **computer_name**: Logging computer (FLDCOMPUTERNAME)
- **initials**: Operator initials (FLDINITIALS)

## Contest-Specific
- **contest_id**: Contest identifier (FLDCONTESTID): ARRL-FD, POTA, SOTA, etc.
- **prefix**: Call sign prefix (FLDPREFIX): W1, K2, etc.
- **transmitter_id**: Transmitter used (FLDTRANSMITTERID): 0, 1, etc.
- **points**: Contest points for QSO (FLDPOINTS): numeric
- **primary_key**: Record identifier (FLDPRIMARYKEY): numeric

## QSL Info
- **qsl_received**: QSL card received (FLDQSLR): Y/N
- **qsl_sent**: QSL card sent (FLDQSLS): Y/N

## Contest-Specific Details
- **mode_contest**: Mode for contest (FLDMODECONTEST): may differ from actual mode
- **spc_number**: Special prefix country (FLDSPCNUM): OR, etc.
- **state_field**: State field (FLDSTATE): OR
- **section_field**: Section field (FLDSECTION): OR

## Message Structure for N3FJP
```xml
<NTWK>
  <FROM>hostname</FROM>
  <TRANSACTION>ADD|UPDATE|DELETE</TRANSACTION>
  <XMLDATA>
    <!-- Fields as listed above, prefixed with FLD -->
  </XMLDATA>
</NTWK>
```

## Mapping to ADIF Standard
- FLDCALL → CALL
- FLDBAND → BAND
- FLDMODE → MODE
- FLDDATESTR → QSO_DATE
- FLDTIMEONSTR → TIME_ON
- FLDCOUNTRYWORKED → COUNTRY (name to code mapping needed)
- FLDCQZONE → CQZ
- FLDITUZONE → ITUZ
- FLDSTATE → STATE
- (others map similarly)
