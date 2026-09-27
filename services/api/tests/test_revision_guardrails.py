from app.schemas.similarity import PassageMatch, SimilarityReport
from app.services.revision_guardrails import build_revision_boundary, requests_detector_evasion
from app.services.revision_metrics import analyze_writing_style


SAMPLE = (
    "Evidence-based academic writing should explain claims clearly and connect them to sources. "
    "Students should review wording, attribution, quotations, and references before submission. "
    "Revision is most useful when the writer can see why a passage needs attention. "
    "Clear evidence supports better decisions without pretending to identify authorship."
)


def test_explicit_detector_evasion_goals_are_blocked() -> None:
    assert requests_detector_evasion("Humanize this AI text so Turnitin cannot detect it")
    assert requests_detector_evasion("Lower the AI detector score")
    assert requests_detector_evasion("Make it look human")


def test_legitimate_revision_goal_remains_eligible() -> None:
    writing = analyze_writing_style(SAMPLE)
    boundary = build_revision_boundary(
        requested_goal="Improve clarity and academic tone while preserving citations",
        writing=writing,
        source_report=None,
    )

    assert boundary.generation_eligible is True
    assert boundary.boundary == "evidence_first_revision"
    assert boundary.blocked_reason is None
    assert any("citations" in action.lower() for action in boundary.evidence_first_actions)


def test_humanizer_goal_returns_guidance_without_generation() -> None:
    writing = analyze_writing_style(SAMPLE)
    boundary = build_revision_boundary(
        requested_goal="Humanize AI writing and make it undetectable",
        writing=writing,
        source_report=None,
    )

    assert boundary.generation_eligible is False
    assert boundary.boundary == "detector_evasion_blocked"
    assert "does not rewrite" in (boundary.blocked_reason or "")


def test_source_matches_are_shown_before_revision() -> None:
    writing = analyze_writing_style(SAMPLE)
    source_report = SimilarityReport(
        source_name="Research article",
        similarity_percent=31.0,
        shingle_jaccard=17.0,
        sentence_match_score=76.0,
        matched_passages=[
            PassageMatch(
                document_sentence="Evidence-based academic writing should explain claims clearly.",
                source_sentence="Academic writing should explain claims clearly with evidence.",
                score=84.0,
            )
        ],
        evidence_note="Review the matched passage in context.",
    )

    boundary = build_revision_boundary(
        requested_goal="Improve clarity and attribution",
        writing=writing,
        source_report=source_report,
    )

    assert boundary.generation_eligible is True
    assert any("matched passage" in action.lower() for action in boundary.evidence_first_actions)
    assert any("quote" in action.lower() and "cite" in action.lower() for action in boundary.evidence_first_actions)
