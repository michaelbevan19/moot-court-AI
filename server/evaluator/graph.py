"""
LangGraph-based Forensic Evaluation Pipeline.

"""

import os
import json
import time
from typing import TypedDict, Optional, List, Dict, Any
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

# ─── LLM Setup ───────────────────────────────────────────────────────────────

GROQ_API_KEY = os.getenv("EVAL_API_KEY")
PRIMARY_MODEL = "qwen/qwen3.6-27b"
FALLBACK_MODELS = ["openai/gpt-oss-120b", "groq/compound"]

def get_llm(model: str = PRIMARY_MODEL, temperature: float = 0):
    return ChatGroq(
        model=model,
        api_key=GROQ_API_KEY,
        temperature=temperature,
    )

def call_llm_with_retry(prompt: str, system_prompt: str = "", model: str = PRIMARY_MODEL):
    """Call LLM with retry + fallback logic. Returns parsed JSON dict."""
    models = [model] + [m for m in FALLBACK_MODELS if m != model]
    last_error = ""

    for m in models:
        llm = get_llm(m)
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))

        for attempt in range(3):
            try:
                response = llm.invoke(messages)
                content = response.content.strip()
                # Strip markdown fences if present
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                return json.loads(content)
            except json.JSONDecodeError:
                # If JSON parsing failed, try to extract JSON from the response
                try:
                    start = content.index("{")
                    end = content.rindex("}") + 1
                    return json.loads(content[start:end])
                except (ValueError, json.JSONDecodeError):
                    last_error = f"JSON parse error from model {m}: {content[:200]}"
                    break  # Don't retry parse errors, try next model
            except Exception as e:
                last_error = str(e)
                if any(kw in last_error for kw in ["503", "429", "UNAVAILABLE", "ResourceExhausted", "rate_limit"]):
                    wait = 3 * (attempt + 1)
                    time.sleep(wait)
                    continue
                elif "404" in last_error or "NOT_FOUND" in last_error:
                    break  # Model doesn't exist, skip to next
                else:
                    break  # Non-transient error, try next model

    raise Exception(f"All models failed. Last error: {last_error}")



# ─── State Definition ────────────────────────────────────────────────────────

class EvalState(TypedDict):
    transcript: str
    proposition: str
    metrics: str
    # Session analysis
    student_exchanges: int
    student_words: int
    tier: str  # critically_short | very_short | short | normal
    max_score: int
    student_lines: List[str]
    # Individual evaluation results (rubric scores)
    fact_check_result: Optional[Dict[str, Any]]
    legal_analysis_result: Optional[Dict[str, Any]]
    etiquette_result: Optional[Dict[str, Any]]
    speech_result: Optional[Dict[str, Any]]
    # Final output
    final_report: Optional[Dict[str, Any]]


# ─── Node Functions ──────────────────────────────────────────────────────────

def analyze_session(state: EvalState) -> dict:
    """Parse transcript to count student exchanges and determine tier."""
    transcript = state["transcript"]
    lines = [l.strip() for l in transcript.split("\n") if l.strip()]

    student_lines = []
    for line in lines:
        if line.upper().startswith("USER:"):
            content = line.split(":", 1)[1].strip() if ":" in line else ""
            if content and not content.startswith("Here is the content of the uploaded documents"):
                student_lines.append(content)

    student_exchanges = len(student_lines)
    student_words = sum(len(line.split()) for line in student_lines)

    if student_exchanges <= 2:
        tier, max_score = "critically_short", 15
    elif student_exchanges <= 4:
        tier, max_score = "very_short", 30
    elif student_exchanges <= 6:
        tier, max_score = "short", 50
    else:
        tier, max_score = "normal", 100

    return {
        "student_exchanges": student_exchanges,
        "student_words": student_words,
        "tier": tier,
        "max_score": max_score,
        "student_lines": student_lines,
    }


def short_circuit_report(state: EvalState) -> dict:
    """For critically short sessions, skip LLM entirely."""
    exchanges = state["student_exchanges"]
    words = state["student_words"]
    base = min(exchanges * 5, 15)
    metrics = state.get("metrics", "")

    feedback = f"""### Evaluation Summary

**Session Duration: Critically Short**

The student participated in only **{exchanges} exchange(s)** with a total of **{words} words**. This is far too brief for a meaningful moot court evaluation.

**Legal Analysis (IRAC):** Unable to assess — insufficient arguments presented.

**Factual Accuracy:** Unable to assess — insufficient content to verify claims.

**Courtroom Etiquette:** Unable to assess — minimal interaction with the bench.

**Recommendation:** Complete a full session with multiple rounds of argument and judicial questioning.

### Speech Evaluation
Too brief to evaluate. {f'Metrics: {metrics}. ' if metrics else ''}Complete a full session for proper assessment."""

    return {
        "final_report": {
            "letter_grade": "F",
            "scores": {
                "knowledge_of_facts": base,
                "knowledge_of_law": base,
                "application_of_law": base,
                "answering_questions": base,
                "etiquette_formalities": base,
                "overall": base,
            },
            "feedback": feedback,
            "evidence_log": [
                {"point": "Session length", "source": "Transcript", "status": f"Only {exchanges} exchange(s) — insufficient"}
            ],
        }
    }


def fact_check(state: EvalState) -> dict:
    """Rubric-based factual accuracy evaluation."""
    transcript = state["transcript"][:5000]
    proposition = state["proposition"][:5000]
    max_score = state["max_score"]
    exchanges = state["student_exchanges"]

    prompt = f"""You are a meticulous legal fact-checker. Evaluate the student's factual accuracy.

TRANSCRIPT:
{transcript}

CASE RECORD (PROPOSITION):
{proposition}

SESSION CONTEXT: {exchanges} student exchanges, max possible score per criterion: {max_score // 4}.

SCORING RUBRIC — fill in each criterion with a score and brief justification:
1. "correct_citations" (0-{max_score // 4}): Did the student correctly cite facts from the case record?
2. "no_fabrications" (0-{max_score // 4}): Did the student avoid making up facts not in the record?
3. "specific_references" (0-{max_score // 4}): Did the student reference specific evidence, dates, or provisions?
4. "addressed_opposing_facts" (0-{max_score // 4}): Did the student acknowledge or rebut the opposing side's facts?

Return ONLY valid JSON:
{{
  "correct_citations": {{ "score": 0, "reason": "..." }},
  "no_fabrications": {{ "score": 0, "reason": "..." }},
  "specific_references": {{ "score": 0, "reason": "..." }},
  "addressed_opposing_facts": {{ "score": 0, "reason": "..." }},
  "evidence_log": [{{ "point": "claim", "source": "ref", "status": "Correct/Incorrect" }}]
}}"""

    result = call_llm_with_retry(prompt, system_prompt="You are a forensic legal fact-checker. Return only JSON.")
    return {"fact_check_result": result}


def legal_analysis(state: EvalState) -> dict:
    """Rubric-based IRAC legal analysis evaluation."""
    transcript = state["transcript"][:5000]
    max_score = state["max_score"]
    exchanges = state["student_exchanges"]

    prompt = f"""You are a senior appellate judge. Evaluate the student's legal reasoning using the IRAC framework.

TRANSCRIPT:
{transcript}

SESSION CONTEXT: {exchanges} student exchanges, max possible score per criterion: {max_score // 4}.

SCORING RUBRIC:
1. "issue_identification" (0-{max_score // 4}): Did the student correctly identify the legal issues?
2. "rule_citation" (0-{max_score // 4}): Did the student cite relevant laws, sections, or precedents?
3. "application" (0-{max_score // 4}): Did the student apply the law to the specific facts of the case?
4. "conclusion" (0-{max_score // 4}): Did the student reach a logical, well-reasoned conclusion?

Return ONLY valid JSON:
{{
  "issue_identification": {{ "score": 0, "reason": "..." }},
  "rule_citation": {{ "score": 0, "reason": "..." }},
  "application": {{ "score": 0, "reason": "..." }},
  "conclusion": {{ "score": 0, "reason": "..." }}
}}"""

    result = call_llm_with_retry(prompt, system_prompt="You are a senior appellate judge. Return only JSON.")
    return {"legal_analysis_result": result}


def etiquette_review(state: EvalState) -> dict:
    """Rubric-based courtroom etiquette evaluation."""
    transcript = state["transcript"][:5000]
    max_score = state["max_score"]
    exchanges = state["student_exchanges"]

    prompt = f"""You are a veteran Clerk of the Court with 30 years of High Court experience. Evaluate courtroom etiquette.

TRANSCRIPT:
{transcript}

SESSION CONTEXT: {exchanges} student exchanges, max possible score per criterion: {max_score // 4}.

SCORING RUBRIC:
1. "formal_address" (0-{max_score // 4}): Did the student use proper titles and address the bench correctly?
2. "respect_for_bench" (0-{max_score // 4}): Did the student show deference to judicial authority?
3. "professional_conduct" (0-{max_score // 4}): Was the student organized, calm, and professional?
4. "protocol_adherence" (0-{max_score // 4}): Did the student follow courtroom procedure (e.g., standing, submissions)?

Return ONLY valid JSON:
{{
  "formal_address": {{ "score": 0, "reason": "..." }},
  "respect_for_bench": {{ "score": 0, "reason": "..." }},
  "professional_conduct": {{ "score": 0, "reason": "..." }},
  "protocol_adherence": {{ "score": 0, "reason": "..." }}
}}"""

    result = call_llm_with_retry(prompt, system_prompt="You are a Clerk of Court. Return only JSON.")
    return {"etiquette_result": result}


def speech_evaluation(state: EvalState) -> dict:
    """Evaluate vocal delivery based on real-time speech metrics."""
    transcript = state["transcript"][:3000]
    metrics = state.get("metrics", "")
    exchanges = state["student_exchanges"]

    prompt = f"""You are a communications coach specializing in courtroom advocacy.

TRANSCRIPT:
{transcript}

LIVE SPEECH METRICS FROM SESSION: {metrics if metrics else "No metrics available."}
SESSION CONTEXT: {exchanges} student exchanges.

The metrics above were captured in real-time during the session. They may include:
- **WPM (Words Per Minute)**: Ideal courtroom pace is 120-150 WPM. Below 80 is too slow, above 160 is rushing.
- **Pitch Variability (Hz std dev)**: Measures vocal expressiveness. Below 15 Hz = monotone, 15-35 Hz = moderate, above 35 Hz = expressive.
- **Articulation Confidence (%)**: Measures speech clarity. Below 60% = unclear, 60-80% = adequate, above 80% = clear and precise.
- **Total Words Spoken** and **Speaking Duration**: Context for session depth.

Write a speech evaluation with these fields:
1. "summary": 3-4 sentences evaluating vocal delivery, pacing, and clarity. Reference the specific metric values provided above. Be specific — cite the exact WPM, pitch variability, and articulation numbers.
2. "delivery_score" (0-25): Overall quality of verbal delivery. Score generously if metrics show ideal range, score low if metrics show poor performance or if no metrics were captured (indicating no voice was used).

Return ONLY valid JSON:
{{
  "summary": "3-4 sentence evaluation referencing specific metrics...",
  "delivery_score": 0
}}"""

    result = call_llm_with_retry(prompt, system_prompt="You are a speech coach. Return only JSON.")
    return {"speech_result": result}


def compile_scorecard(state: EvalState) -> dict:
    """Deterministic aggregation — NO LLM call. Pure math from rubric scores."""
    max_score = state["max_score"]

    # Extract rubric scores safely
    def sum_rubric(result_dict):
        if not result_dict:
            return 0
        total = 0
        for key, val in result_dict.items():
            if isinstance(val, dict) and "score" in val:
                total += val["score"]
        return min(total, max_score)

    fact_score = sum_rubric(state.get("fact_check_result"))
    legal_score = sum_rubric(state.get("legal_analysis_result"))
    etiquette_score = sum_rubric(state.get("etiquette_result"))

    speech_result = state.get("speech_result") or {}
    speech_delivery = min(speech_result.get("delivery_score", 0), 25)

    # Map to final categories (all capped at max_score)
    knowledge_of_facts = min(fact_score, max_score)
    knowledge_of_law = min(legal_score, max_score)
    application_of_law = min(legal_score, max_score)  # Derived from legal analysis
    answering_questions = min((fact_score + legal_score) // 2, max_score)  # Blend
    etiquette_formalities = min(etiquette_score, max_score)

    overall = min(
        (knowledge_of_facts + knowledge_of_law + application_of_law +
         answering_questions + etiquette_formalities) // 5,
        max_score
    )

    # Determine letter grade
    if overall <= 20:
        grade = "F"
    elif overall <= 40:
        grade = "D"
    elif overall <= 60:
        grade = "C"
    elif overall <= 80:
        grade = "B"
    else:
        grade = "A"

    # Build feedback from individual results
    def get_reasons(result_dict):
        if not result_dict:
            return "No data available."
        parts = []
        for key, val in result_dict.items():
            if isinstance(val, dict) and "reason" in val:
                parts.append(f"- **{key.replace('_', ' ').title()}** ({val.get('score', 'N/A')}/{max_score // 4}): {val['reason']}")
        return "\n".join(parts) if parts else "No detailed breakdown available."

    fact_reasons = get_reasons(state.get("fact_check_result"))
    legal_reasons = get_reasons(state.get("legal_analysis_result"))
    etiquette_reasons = get_reasons(state.get("etiquette_result"))
    speech_summary = speech_result.get("summary", "No speech evaluation available.")

    # Collect evidence log
    evidence_log = []
    fact_result = state.get("fact_check_result") or {}
    if "evidence_log" in fact_result:
        evidence_log = fact_result["evidence_log"]

    feedback = f"""### Factual Accuracy ({knowledge_of_facts}/{max_score})
{fact_reasons}

### Legal Analysis — IRAC ({knowledge_of_law}/{max_score})
{legal_reasons}

### Courtroom Etiquette ({etiquette_formalities}/{max_score})
{etiquette_reasons}

### Speech Evaluation
{speech_summary}"""

    return {
        "final_report": {
            "letter_grade": grade,
            "scores": {
                "knowledge_of_facts": knowledge_of_facts,
                "knowledge_of_law": knowledge_of_law,
                "application_of_law": application_of_law,
                "answering_questions": answering_questions,
                "etiquette_formalities": etiquette_formalities,
                "overall": overall,
            },
            "feedback": feedback,
            "evidence_log": evidence_log,
        }
    }


# ─── Graph Builder ───────────────────────────────────────────────────────────

def route_after_analysis(state: EvalState) -> str:
    """Conditional edge: short-circuit if session is too short."""
    if state["tier"] == "critically_short":
        return "short_circuit"
    return "evaluate"


def build_graph():
    """Build and compile the LangGraph evaluation pipeline."""
    graph = StateGraph(EvalState)

    # Add nodes
    graph.add_node("analyze_session", analyze_session)
    graph.add_node("short_circuit_report", short_circuit_report)
    graph.add_node("fact_check", fact_check)
    graph.add_node("legal_analysis", legal_analysis)
    graph.add_node("etiquette_review", etiquette_review)
    graph.add_node("speech_evaluation", speech_evaluation)
    graph.add_node("compile_scorecard", compile_scorecard)

    # Set entry point
    graph.set_entry_point("analyze_session")

    # Conditional edge after session analysis
    graph.add_conditional_edges(
        "analyze_session",
        route_after_analysis,
        {
            "short_circuit": "short_circuit_report",
            "evaluate": "fact_check",
        },
    )

    # Linear evaluation flow
    graph.add_edge("fact_check", "legal_analysis")
    graph.add_edge("legal_analysis", "etiquette_review")
    graph.add_edge("etiquette_review", "speech_evaluation")
    graph.add_edge("speech_evaluation", "compile_scorecard")

    # Terminal edges
    graph.add_edge("short_circuit_report", END)
    graph.add_edge("compile_scorecard", END)

    return graph.compile()
