import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for real-time speech analytics using the Web Audio API.
 * Provides: waveform data, pitch detection, WPM tracking, and articulation scoring.
 */
const useSpeechAnalytics = () => {
    // --- State ---
    const [waveformData, setWaveformData] = useState(new Uint8Array(64).fill(128));
    const [currentWPM, setCurrentWPM] = useState(0);
    const [pitchVariability, setPitchVariability] = useState(0);
    const [pitchLabel, setPitchLabel] = useState('--');
    const [articulationScore, setArticulationScore] = useState(0);
    const [articulationLabel, setArticulationLabel] = useState('--');
    const [wpmLabel, setWpmLabel] = useState('--');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // --- Refs ---
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const streamRef = useRef(null);
    const animFrameRef = useRef(null);

    // Speech metrics refs (avoid stale closures)
    const totalWordsRef = useRef(0);
    const sessionStartRef = useRef(null);
    const pitchSamplesRef = useRef([]);
    const confidenceSamplesRef = useRef([]);

    // --- Pitch detection via autocorrelation ---
    const detectPitch = useCallback((analyser, sampleRate) => {
        const bufferLength = analyser.fftSize;
        const buffer = new Float32Array(bufferLength);
        analyser.getFloatTimeDomainData(buffer);

        // Check if there's enough signal (not silence)
        let rms = 0;
        for (let i = 0; i < bufferLength; i++) {
            rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / bufferLength);
        if (rms < 0.01) return -1; // Too quiet

        // Autocorrelation
        let bestOffset = -1;
        let bestCorrelation = 0;
        const minPeriod = Math.floor(sampleRate / 500); // Max 500 Hz
        const maxPeriod = Math.floor(sampleRate / 75);  // Min 75 Hz

        for (let offset = minPeriod; offset < maxPeriod && offset < bufferLength; offset++) {
            let correlation = 0;
            for (let i = 0; i < bufferLength - offset; i++) {
                correlation += buffer[i] * buffer[i + offset];
            }

            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        }

        if (bestOffset === -1 || bestCorrelation < 0.01) return -1;
        return sampleRate / bestOffset;
    }, []);

    // --- Animation loop: waveform + pitch ---
    const tick = useCallback(() => {
        if (!analyserRef.current || !audioContextRef.current) return;

        const analyser = analyserRef.current;
        const sampleRate = audioContextRef.current.sampleRate;

        // Waveform
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        // Downsample to ~32 bars for the visual
        const step = Math.floor(dataArray.length / 32);
        const bars = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bars[i] = dataArray[i * step];
        }
        setWaveformData(bars);

        // Pitch
        const pitch = detectPitch(analyser, sampleRate);
        if (pitch > 0 && pitch < 500) {
            pitchSamplesRef.current.push(pitch);

            // Compute standard deviation of pitch samples
            const samples = pitchSamplesRef.current;
            if (samples.length > 5) {
                const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
                const sqDiffs = samples.map(v => (v - mean) ** 2);
                const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / samples.length);
                const roundedStd = Math.round(stdDev);
                setPitchVariability(roundedStd);

                if (roundedStd < 15) {
                    setPitchLabel('Monotone');
                } else if (roundedStd < 35) {
                    setPitchLabel('Moderate');
                } else {
                    setPitchLabel('Expressive');
                }
            }
        }

        animFrameRef.current = requestAnimationFrame(tick);
    }, [detectPitch]);

    // --- Start analyzing ---
    const startAnalyzing = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioCtx;

            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;

            // Start animation loop
            setIsAnalyzing(true);
            if (!sessionStartRef.current) {
                sessionStartRef.current = Date.now();
            }
            animFrameRef.current = requestAnimationFrame(tick);
        } catch (err) {
            console.error('[SpeechAnalytics] Failed to access microphone:', err);
        }
    }, [tick]);

    // --- Stop analyzing ---
    const stopAnalyzing = useCallback(() => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        analyserRef.current = null;
        setIsAnalyzing(false);
        // Reset waveform to flat line
        setWaveformData(new Uint8Array(32).fill(128));
    }, []);

    // --- Called by CourtRoom when SpeechRecognition produces a final result ---
    const recordWords = useCallback((wordCount, confidence) => {
        totalWordsRef.current += wordCount;

        if (confidence !== undefined && confidence !== null && confidence > 0) {
            confidenceSamplesRef.current.push(confidence);
        }

        // Update WPM
        if (sessionStartRef.current) {
            const elapsedMin = (Date.now() - sessionStartRef.current) / 60000;
            if (elapsedMin > 0.05) { // At least 3 seconds
                const wpm = Math.round(totalWordsRef.current / elapsedMin);
                setCurrentWPM(wpm);

                if (wpm < 80) setWpmLabel('Too Slow');
                else if (wpm <= 120) setWpmLabel('Measured');
                else if (wpm <= 160) setWpmLabel('Ideal');
                else setWpmLabel('Rushing');
            }
        }

        // Update articulation
        const samples = confidenceSamplesRef.current;
        if (samples.length > 0) {
            const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100);
            setArticulationScore(avg);

            if (avg < 60) setArticulationLabel('Unclear');
            else if (avg < 80) setArticulationLabel('Adequate');
            else setArticulationLabel('Clear & Precise');
        }
    }, []);

    // --- Get metrics string for the evaluator ---
    const getMetricsString = useCallback(() => {
        const parts = [];
        if (currentWPM > 0) parts.push(`WPM: ${currentWPM} (${wpmLabel})`);
        if (pitchVariability > 0) parts.push(`Pitch Variability: ${pitchVariability} Hz std dev (${pitchLabel})`);
        if (articulationScore > 0) parts.push(`Articulation Confidence: ${articulationScore}% (${articulationLabel})`);
        parts.push(`Total Words Spoken: ${totalWordsRef.current}`);
        if (sessionStartRef.current) {
            const durationSec = Math.round((Date.now() - sessionStartRef.current) / 1000);
            parts.push(`Speaking Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`);
        }
        return parts.join(', ');
    }, [currentWPM, wpmLabel, pitchVariability, pitchLabel, articulationScore, articulationLabel]);

    // --- Reset all metrics ---
    const resetMetrics = useCallback(() => {
        totalWordsRef.current = 0;
        sessionStartRef.current = null;
        pitchSamplesRef.current = [];
        confidenceSamplesRef.current = [];
        setCurrentWPM(0);
        setPitchVariability(0);
        setArticulationScore(0);
        setWpmLabel('--');
        setPitchLabel('--');
        setArticulationLabel('--');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAnalyzing();
        };
    }, [stopAnalyzing]);

    return {
        // Data
        waveformData,
        currentWPM,
        wpmLabel,
        pitchVariability,
        pitchLabel,
        articulationScore,
        articulationLabel,
        isAnalyzing,

        // Actions
        startAnalyzing,
        stopAnalyzing,
        recordWords,
        getMetricsString,
        resetMetrics,
    };
};

export default useSpeechAnalytics;
