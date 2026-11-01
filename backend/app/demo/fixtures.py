"""Clearly-labelled DEMONSTRATION fixtures. Everything here is fictional: the scholarship, the foundation,
the partner university and every date, amount and URL. Fixtures are fed through the SAME extraction,
chunking, claim, conflict and freshness code as live sources. Nothing about the analysis is hardcoded."""
from datetime import date

DEMO_LABEL = "DEMONSTRATION DATA — fictional sources, not real organisations or real scholarship terms."
DEMO_QUESTION = "What should I verify before applying for the Meridian Excellence Scholarship (2026-27 cycle)?"
DEMO_OBJECTIVE = "Decide whether I can apply to the Meridian Excellence Scholarship for 2026-27 and what is still unknown."
DEMO_AS_OF = date(2026, 10, 30)

DEMO_SOURCES = [
    {
        "slug": "official-guidelines",
        "source_type": "official_source",
        "html": """<!doctype html><html><head><title>[DEMO] Meridian Excellence Scholarship — Official Guidelines 2026-27</title>
<meta property="article:published_time" content="2026-07-01">
<meta property="article:modified_time" content="2026-08-15"></head><body><main>
<h1>Meridian Excellence Scholarship Guidelines 2026-27</h1>
<p>This page is fictional demonstration content created for the Parallax - Digital Dark Spot demo.</p>
<h2>Eligibility</h2>
<p>Applicants must be enrolled full-time in an accredited postgraduate programme.</p>
<p>Applicants must hold at least 75% in their previous degree.</p>
<h2>Key dates</h2>
<p>Applications close on 10 November 2026.</p>
<h2>The award</h2>
<p>The award is ₹1,50,000 per academic year for domestic students, paid in two instalments.</p>
<h2>How to apply</h2>
<p>Applicants must upload their latest transcript, a statement of purpose and two recommendation letters.</p>
<p>Apply online through the Meridian Foundation portal at https://scholarships.meridian-demo.invalid/apply.</p>
<h2>Selection</h2>
<p>Applications are evaluated on academic merit and a statement of purpose, with a panel interview for shortlisted candidates.</p>
</main></body></html>""",
    },
    {
        "slug": "partner-university-faq",
        "source_type": "organization",
        "html": """<!doctype html><html><head><title>[DEMO] Partner University FAQ — Meridian Scholarship</title></head><body><main>
<h1>Meridian Scholarship FAQ</h1>
<p>This page is fictional demonstration content created for the Parallax - Digital Dark Spot demo.</p>
<h2>Deadlines</h2>
<p>Applications for the 2026-27 cycle must be submitted by 20 November 2026.</p>
<h2>Funding</h2>
<p>Recipients receive ₹1,50,000 per year for domestic students.</p>
<p>International students receive ₹2,00,000 per year.</p>
<h2>Who can apply</h2>
<p>Applicants must be enrolled full-time in an accredited postgraduate programme.</p>
</main></body></html>""",
    },
    {
        "slug": "archive-2024-announcement",
        "source_type": "news",
        "html": """<!doctype html><html><head><title>[DEMO] Meridian Scholarship Announcement (2024-25 cycle)</title>
<meta property="article:published_time" content="2024-06-10"></head><body><main>
<h1>Meridian Scholarship 2024-25 announcement</h1>
<p>This page is fictional demonstration content created for the Parallax - Digital Dark Spot demo.</p>
<p>Applications for the 2024-25 cycle close on 15 November 2024.</p>
<p>The award is ₹1,25,000 per year for domestic students.</p>
<p>Applicants must hold at least 70% in their previous degree.</p>
</main></body></html>""",
    },
    {
        "slug": "applicant-checklist",
        "source_type": "document",
        "html": """<!doctype html><html><head><title>[DEMO] Applicant Checklist (community-written)</title></head><body><main>
<h1>Applicant checklist</h1>
<p>This page is fictional demonstration content created for the Parallax - Digital Dark Spot demo.</p>
<h2>Documents</h2>
<p>Applicants must submit a government photo ID, their latest transcript, a statement of purpose and two recommendation letters.</p>
<h2>After applying</h2>
<p>Shortlisted candidates are evaluated through a panel interview in December.</p>
</main></body></html>""",
    },
]

# Deliberately absent from every fixture: renewal conditions. The engine must surface that as a gap.
