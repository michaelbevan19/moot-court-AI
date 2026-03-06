"""
Main entry point for the forensic evaluation pipeline.
Uses LangGraph state-machine from graph.py.
Reads JSON from stdin, outputs JSON to stdout.
"""

import sys
import json
import io
import os

os.environ["CREWAI_TELEMETRY_OPT_OUT"] = "true"

# Suppress library print output by redirecting stdout during imports and execution
temp_stdout = io.StringIO()
original_stdout = sys.stdout
original_stderr = sys.stderr

sys.stdout = temp_stdout

try:
    from graph import build_graph

    # Restore stdout briefly to read stdin (some systems need this)
    sys.stdout = original_stdout
    input_data = sys.stdin.read()
    sys.stdout = temp_stdout

    data = json.loads(input_data)

    transcript = data.get("transcript", "")
    proposition = data.get("proposition", "")
    metrics = data.get("metrics", "")

    # Log to stderr for debugging (won't interfere with JSON stdout)
    print(f"[Evaluator] Starting evaluation. Exchanges detected...", file=original_stderr)

    # Build and run the evaluation graph
    graph = build_graph()

    initial_state = {
        "transcript": transcript,
        "proposition": proposition,
        "metrics": metrics,
        "student_exchanges": 0,
        "student_words": 0,
        "tier": "",
        "max_score": 0,
        "student_lines": [],
        "fact_check_result": None,
        "legal_analysis_result": None,
        "etiquette_result": None,
        "speech_result": None,
        "final_report": None,
    }

    # Run the graph
    final_state = graph.invoke(initial_state)

    result = final_state.get("final_report", {
        "letter_grade": "ERR",
        "scores": {},
        "feedback": "Evaluation graph did not produce a report."
    })

    print(f"[Evaluator] Evaluation complete. Grade: {result.get('letter_grade', 'N/A')}", file=original_stderr)

    sys.stdout = original_stdout
    output = json.dumps(result)
    sys.stdout.write(output + "\n")
    sys.stdout.flush()

except Exception as e:
    sys.stdout = original_stdout
    error_msg = str(e)
    print(f"[Evaluator] ERROR: {error_msg}", file=original_stderr)

    if any(kw in error_msg for kw in ["503", "429", "UNAVAILABLE", "ResourceExhausted", "RateLimitError", "rate_limit"]):
        feedback = (
            "**LLM Service Currently Busy**\n\n"
            "We tried multiple models but the provider is experiencing high demand.\n\n"
            f"*Please wait a minute and try again.*\n\n(Details: {error_msg})"
        )
    else:
        feedback = f"**System Error during Evaluation:**\n\n{error_msg}"

    output = json.dumps({
        "letter_grade": "ERR",
        "scores": {},
        "feedback": feedback
    })
    sys.stdout.write(output + "\n")
    sys.stdout.flush()

