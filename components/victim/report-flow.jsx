"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FullscreenChat } from "./fullscreen-chat";

function normalizePhone(input) {
  return String(input || "").replace(/\D/g, "");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function extractTimelineFromDescription(text) {
  if (!text || text.length < 10) return [];

  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const found = [];
  const pushFound = (sentence, isoDate) => {
    if (!isoDate) return;
    found.push({
      date: isoDate,
      description: sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence,
    });
  };

  for (const sentence of sentences) {
    for (const match of sentence.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/g)) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      pushFound(sentence, toIsoDate(year, match[2], match[1]));
    }

    for (const match of sentence.matchAll(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*,?\s*(\d{4})\b/g
    )) {
      const month = monthMap[match[2].toLowerCase()];
      pushFound(sentence, month ? toIsoDate(match[3], month, match[1]) : null);
    }

    for (const match of sentence.matchAll(
      /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/g
    )) {
      const month = monthMap[match[1].toLowerCase()];
      pushFound(sentence, month ? toIsoDate(match[3], month, match[2]) : null);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of found) {
    const key = `${item.date}|${item.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function createTimelineEvent(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: "",
    description: "",
    place: "",
    collapsed: false,
    autoDetected: false,
    ...overrides,
  };
}

function sortTimelineEvents(events) {
  return [...events].sort((a, b) => {
    const da = a.date || "9999-12-31";
    const db = b.date || "9999-12-31";
    return da.localeCompare(db);
  });
}

export function VictimReportFlow() {
  // Step 1: Phone + OTP gate
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [existingCases, setExistingCases] = useState([]);

  // Step 2: Onboarding mode
  const [onboardingType, setOnboardingType] = useState("anonymous");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [aadhaarIdentity, setAadhaarIdentity] = useState(null);
  const [isFetchingAadhaar, setIsFetchingAadhaar] = useState(false);
  const [aadhaarError, setAadhaarError] = useState("");
  const [lastAutoFetchedAadhaar, setLastAutoFetchedAadhaar] = useState("");

  // Initial description entry
  const [description, setDescription] = useState("");
  const [evidenceImages, setEvidenceImages] = useState([]);
  const fileInputRef = useRef(null);
  const [timelineEvents, setTimelineEvents] = useState([createTimelineEvent()]);
  const [timelineError, setTimelineError] = useState("");
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // After submission
  const [caseId, setCaseId] = useState(null);
  const [complaintId, setComplaintId] = useState(null);
  const [showChat, setShowChat] = useState(false);

  // Final triage data
  const [triageData, setTriageData] = useState(null);

  useEffect(() => {
    const detected = extractTimelineFromDescription(description);
    if (detected.length === 0) return;
    const reportingDateIso = new Date().toISOString().slice(0, 10);

    setTimelineEvents((prev) => {
      const seenDates = new Set(prev.map((event) => event.date).filter(Boolean));
      const additions = detected
        .filter((item) => !seenDates.has(item.date) && item.date <= reportingDateIso)
        .map((item) =>
          createTimelineEvent({
            date: item.date,
            description: item.description,
            place: "",
            collapsed: true,
            autoDetected: true,
          })
        );

      if (additions.length === 0) return prev;
      return sortTimelineEvents([...additions, ...prev]);
    });
  }, [description]);

  useEffect(() => {
    return () => {
      evidenceImages.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [evidenceImages]);

  function addEvidenceFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => String(file.type || "").startsWith("image/"));
    if (files.length === 0) return;

    setEvidenceImages((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeEvidenceImage(imageId) {
    setEvidenceImages((prev) => {
      const toRemove = prev.find((item) => item.id === imageId);
      if (toRemove?.previewUrl) URL.revokeObjectURL(toRemove.previewUrl);
      return prev.filter((item) => item.id !== imageId);
    });
  }

  function handleDescriptionPaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (imageFiles.length > 0) {
      event.preventDefault();
      addEvidenceFiles(imageFiles);
    }
  }

  async function handleFetchAadhaarIdentity() {
    const normalizedAadhaar = String(aadhaarNumber || "").replace(/\D/g, "");
    return fetchAadhaarIdentity(normalizedAadhaar);
  }

  async function fetchAadhaarIdentity(normalizedAadhaar) {
    if (normalizedAadhaar.length !== 12) {
      setAadhaarError("Enter a valid 12-digit Aadhaar number");
      return false;
    }

    if (!verifiedPhone) {
      setAadhaarError("Verify phone number before Aadhaar verification");
      return false;
    }

    setIsFetchingAadhaar(true);
    setAadhaarError("");

    try {
      const response = await fetch("/api/identity/aadhaar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaarNumber: normalizedAadhaar,
          phoneNumber: verifiedPhone,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setAadhaarIdentity(null);
        setAadhaarError(data.error || "Failed to fetch Aadhaar profile");
        return false;
      }

      setAadhaarIdentity(data.identity);
      setLastAutoFetchedAadhaar(normalizedAadhaar);
      return true;
    } catch (error) {
      console.error(error);
      setAadhaarIdentity(null);
      setAadhaarError("Failed to fetch Aadhaar profile");
      return false;
    } finally {
      setIsFetchingAadhaar(false);
    }
  }

  useEffect(() => {
    const normalizedAadhaar = String(aadhaarNumber || "").replace(/\D/g, "");
    if (
      onboardingType === "identified" &&
      verifiedPhone &&
      normalizedAadhaar.length === 12 &&
      normalizedAadhaar !== lastAutoFetchedAadhaar &&
      !isFetchingAadhaar
    ) {
      fetchAadhaarIdentity(normalizedAadhaar);
    }
  }, [aadhaarNumber, onboardingType, verifiedPhone, lastAutoFetchedAadhaar, isFetchingAadhaar]);

  async function handleVerifyPhone() {
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      setVerificationError("Please enter a valid phone number.");
      return;
    }

    if (!otp.trim()) {
      setVerificationError("Please enter OTP.");
      return;
    }

    setIsVerifying(true);
    setVerificationError("");

    try {
      const response = await fetch("/api/complaints/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, otp: otp.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setVerificationError(data.error || "Verification failed");
        return;
      }

      if (data.exists) {
        const latestCaseId = data.latestCaseId || data.cases?.[0]?.caseId;
        if (latestCaseId) {
          window.location.href = `/status?caseId=${encodeURIComponent(latestCaseId)}`;
          return;
        }

        setExistingCases(data.cases || []);
        setVerifiedPhone(normalizedPhone);
        return;
      }

      setExistingCases([]);
      setVerifiedPhone(normalizedPhone);
    } catch (error) {
      console.error(error);
      setVerificationError("Failed to verify phone number");
    } finally {
      setIsVerifying(false);
    }
  }

  // Handle initial submission
  async function handleSubmit() {
    if (!verifiedPhone) {
      alert("Please verify your phone number first");
      return;
    }

    if (!description.trim() || description.length < 10) {
      alert("Please provide a description of at least 10 characters");
      return;
    }

    const normalizedTimeline = timelineEvents
      .map((event) => ({
        date: String(event.date || "").trim(),
        description: String(event.description || "").trim(),
        place: String(event.place || "").trim() || null,
      }))
      .filter((event) => event.date || event.description || event.place);

    const validTimeline = normalizedTimeline.filter(
      (event) => event.date && event.description
    );

    const reportingDateIso = new Date().toISOString().slice(0, 10);
    const hasFutureIncident = validTimeline.some((event) => event.date > reportingDateIso);
    if (hasFutureIncident) {
      setTimelineError("Incident date cannot be after the reporting date.");
      return;
    }

    if (validTimeline.length === 0) {
      setTimelineError("Add at least one incident with approx date and what happened.");
      return;
    }

    setTimelineError("");

    if (onboardingType === "identified" && !aadhaarIdentity) {
      alert("Please verify Aadhaar details for normal onboarding");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("description", description.trim());
      formData.append("phone", verifiedPhone);
      formData.append("isAnonymous", onboardingType !== "identified" ? "true" : "false");
      formData.append(
        "victimName",
        onboardingType === "identified" ? aadhaarIdentity?.full_name || "" : ""
      );
      formData.append(
        "victimRole",
        onboardingType === "identified" ? "identified_victim" : ""
      );
      formData.append(
        "aadhaarIdentityId",
        onboardingType === "identified" ? aadhaarIdentity?.id || "" : ""
      );
      formData.append("timeline", JSON.stringify(validTimeline));

      evidenceImages.forEach((item) => {
        formData.append("evidenceImages", item.file, item.file.name || "evidence-image.png");
      });

      const response = await fetch("/api/complaints/submit", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setCaseId(data.caseId);
        setComplaintId(data.complaintId);
        setShowChat(true); // Open fullscreen chat immediately
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to submit complaint");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleTriageComplete(data) {
    setTriageData(data);
  }

  function handleCloseChat() {
    setShowChat(false);
  }

  function goToStatus(caseId) {
    window.location.href = `/status?caseId=${encodeURIComponent(caseId)}`;
  }

  function updateTimelineEvent(index, key, value) {
    const reportingDateIso = new Date().toISOString().slice(0, 10);

    if (key === "date" && value && value > reportingDateIso) {
      setTimelineError("Incident date cannot be after the reporting date.");
      return;
    }

    setTimelineError("");
    setTimelineEvents((prev) => {
      const next = [...prev];
      const updatedEvent = { ...next[index], [key]: value };
      next[index] = updatedEvent;
      const sorted = sortTimelineEvents(next);
      const newIndex = sorted.findIndex((event) => event.id === updatedEvent.id);
      setSelectedTimelineIndex(newIndex === -1 ? 0 : newIndex);
      return sorted;
    });
  }

  function addTimelineEvent() {
    setTimelineEvents((prev) => {
      const newEvent = createTimelineEvent();
      const sorted = sortTimelineEvents([...prev, newEvent]);
      const newIndex = sorted.findIndex((event) => event.id === newEvent.id);
      setSelectedTimelineIndex(newIndex === -1 ? 0 : newIndex);
      return sorted;
    });
  }

  function removeTimelineEvent(index) {
    setTimelineEvents((prev) => {
      if (prev.length === 1) {
        return [createTimelineEvent()];
      }
      return sortTimelineEvents(prev.filter((_, i) => i !== index));
    });
    setSelectedTimelineIndex((prev) => {
      if (timelineEvents.length <= 1) return 0;
      if (prev > index) return prev - 1;
      if (prev === index) return Math.max(0, prev - 1);
      return prev;
    });
  }

  function toggleTimelineCard(index) {
    setTimelineEvents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], collapsed: !next[index].collapsed };
      return next;
    });
  }

  // If chat is active, render fullscreen chat
  if (showChat && caseId) {
    return (
      <FullscreenChat
        caseId={caseId}
        complaintId={complaintId}
        initialDescription={description}
        onTriageComplete={handleTriageComplete}
        onClose={handleCloseChat}
      />
    );
  }

  // If triage is complete, show summary
  if (triageData && caseId) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
        <div className="mb-8 space-y-3">
          <Badge variant="outline">Report Submitted</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Your Case Has Been Filed</h1>
          <p className="text-muted-foreground">
            Your report has been securely submitted for internal review.
          </p>
        </div>

        {/* Case ID Display */}
        <Card className="mb-6 border-l-4 border-l-emerald-500">
          <CardHeader>
            <CardTitle>Your Case ID</CardTitle>
            <CardDescription>Save this Case ID to check your case status later.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950">
              <p className="mb-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
                Case ID
              </p>
              <p className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {caseId}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ⚠️ Keep this Case ID safe. You'll need it to track your case.
            </p>
          </CardContent>
        </Card>

        {/* Confirmation */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle>Submission Confirmed</CardTitle>
            <CardDescription>Your case details were captured successfully.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                What happens next?
              </p>
              <ul className="mt-2 space-y-1 text-sm text-green-800 dark:text-green-200">
                <li>✓ An internal case handler will review your report</li>
                <li>✓ You can check status using Case ID: <strong>{caseId}</strong></li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Existing user flow: phone already seen in system.
  if (verifiedPhone && existingCases.length > 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
        <div className="mb-8 space-y-3">
          <Badge variant="outline">Existing Cases Found</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Go To Your Case Dashboard</h1>
          <p className="text-muted-foreground">
            This phone number is already linked to existing case records. Select a Case ID to check status.
          </p>
        </div>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle>Linked Cases</CardTitle>
            <CardDescription>Use these case IDs to continue tracking your reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {existingCases.map((item) => (
              <div key={item.caseId} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{item.caseId}</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {item.status} | Type: {item.type || "Complaint"}
                  </p>
                </div>
                <Button onClick={() => goToStatus(item.caseId)} size="sm">
                  Open Status
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setPhone("");
                setOtp("");
                setVerifiedPhone(null);
                setExistingCases([]);
                setVerificationError("");
              }}
            >
              Use Different Phone Number
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2 is only available after successful phone+OTP verification.
  if (!verifiedPhone) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <div className="mb-8 space-y-3">
          <Badge variant="outline">Phone Verification Required</Badge>
          <h1 className="bg-gradient-to-r from-[#0f766e] via-[#0c4a6e] to-[#1d4ed8] bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
            Start With Phone Number and OTP
          </h1>
          <p className="text-muted-foreground">
            To continue, verify your phone number first. If this number already has cases, you will be sent to your status dashboard.
          </p>
        </div>

        <Card className="border-l-4 border-l-[#0c4a6e]">
          <CardHeader>
            <CardTitle>Verify Phone</CardTitle>
            <CardDescription>Enter your phone number and OTP to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-number">Phone Number</Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">OTP</Label>
              <Input
                id="otp"
                type="text"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Current dev OTP: 123456</p>
            </div>

            {verificationError ? <p className="text-sm text-red-600">{verificationError}</p> : null}

            <Button onClick={handleVerifyPhone} disabled={isVerifying} className="w-full">
              {isVerifying ? "Verifying..." : "Verify and Continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Initial description form
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <div className="mb-8 space-y-3">
        <Badge variant="outline">Victim Onboarding</Badge>
        <h1 className="bg-gradient-to-r from-[#0f766e] via-[#0c4a6e] to-[#1d4ed8] bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
          Report Harassment Incident
        </h1>
        <p className="text-muted-foreground">
          Phone verified. Select Anonymous or Identified onboarding before continuing.
        </p>
      </div>

      <Card className="mb-6 border-l-4 border-l-[#0f766e]">
        <CardHeader>
          <CardTitle>Choose Reporting Mode</CardTitle>
          <CardDescription>
            Anonymous keeps identity hidden. Normal links profile from Aadhaar (mock government lookup).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              type="button"
              variant={onboardingType === "anonymous" ? "default" : "outline"}
              onClick={() => {
                setOnboardingType("anonymous");
                setAadhaarError("");
              }}
            >
              Anonymous
            </Button>
            <Button
              type="button"
              variant={onboardingType === "identified" ? "default" : "outline"}
              onClick={() => setOnboardingType("identified")}
            >
              Normal
            </Button>
          </div>

          {onboardingType === "identified" ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="aadhaar-number">Aadhaar Number</Label>
                <Input
                  id="aadhaar-number"
                  type="text"
                  inputMode="numeric"
                  placeholder="12-digit Aadhaar number"
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Profile auto-fetches once 12 digits are entered.
                </p>
              </div>

              <Button type="button" onClick={handleFetchAadhaarIdentity} disabled={isFetchingAadhaar}>
                {isFetchingAadhaar ? "Fetching Aadhaar Profile..." : "Fetch Aadhaar Profile"}
              </Button>

              {aadhaarError ? <p className="text-sm text-red-600">{aadhaarError}</p> : null}

              {aadhaarIdentity ? (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p><strong>Name:</strong> {aadhaarIdentity.full_name}</p>
                  <p><strong>Gender:</strong> {aadhaarIdentity.gender}</p>
                  <p><strong>DOB:</strong> {aadhaarIdentity.date_of_birth || "-"}</p>
                  <p><strong>Address:</strong> {aadhaarIdentity.address_line}, {aadhaarIdentity.district}, {aadhaarIdentity.state} - {aadhaarIdentity.pincode}</p>
                  <p><strong>Aadhaar:</strong> {aadhaarIdentity.aadhaar_masked}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Anonymous mode selected. Victim identity will not be attached to this complaint.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-[#1d4ed8]">
        <CardHeader>
          <CardTitle>Describe What Happened</CardTitle>
          <CardDescription>
            Tell us about the incident. Our AI will analyze your report and may ask follow-up
            questions to ensure we have all the necessary information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Incident Description</Label>
            <Textarea
              id="description"
              placeholder="Please describe:&#10;• What happened?&#10;• When did it happen?&#10;• Where did it happen?&#10;&#10;Be as specific as possible. The more details you provide, the faster we can help."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handleDescriptionPaste}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters required. Your information is confidential.
            </p>

            <div className="space-y-2 rounded-md border bg-background/50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Evidence Images (paste screenshots or upload)
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add Images
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => addEvidenceFiles(event.target.files)}
              />

              {evidenceImages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {evidenceImages.map((item) => (
                    <div key={item.id} className="relative h-20 w-20 overflow-hidden rounded-md border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt="Evidence preview"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white"
                        onClick={() => removeEvidenceImage(item.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No images attached. Paste directly into description box or click Add Images.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Incident Timeline</p>
                <p className="text-xs text-muted-foreground">
                  Timeline auto-sorts by date. Future dates are not allowed.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addTimelineEvent}>
                + Add Event
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border bg-background p-4">
              <div className="mb-2 h-0.5 w-full bg-blue-200" />
              <div className="flex min-w-max items-end gap-6">
                {timelineEvents.map((event, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedTimelineIndex(index)}
                    className="flex flex-col items-center"
                    title="Click to expand"
                  >
                    <span className="mb-1 text-[11px] font-medium text-blue-700">
                      {event.date || "No date"}
                    </span>
                    <span
                      className={`h-12 w-1 rounded-full ${selectedTimelineIndex === index ? "bg-blue-600" : "bg-blue-300"}`}
                    />
                  </button>
                ))}

                <div className="flex flex-col items-center">
                  <span className="mb-1 text-[11px] font-semibold text-emerald-700">
                    {new Date().toISOString().slice(0, 10)}
                  </span>
                  <span className="h-16 w-1 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>

            {timelineEvents[selectedTimelineIndex] ? (
              <div className="rounded-md border bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Editing Incident {selectedTimelineIndex + 1}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleTimelineCard(selectedTimelineIndex)}
                    >
                      {timelineEvents[selectedTimelineIndex].collapsed ? "Expand" : "Collapse"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeTimelineEvent(selectedTimelineIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                {timelineEvents[selectedTimelineIndex].collapsed ? (
                  <p className="text-xs text-muted-foreground">
                    Collapsed. Click Expand to edit details.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor={`timeline-date-${selectedTimelineIndex}`}>Approx Date</Label>
                      <Input
                        id={`timeline-date-${selectedTimelineIndex}`}
                        type="date"
                        value={timelineEvents[selectedTimelineIndex].date}
                        onChange={(e) =>
                          updateTimelineEvent(selectedTimelineIndex, "date", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`timeline-what-${selectedTimelineIndex}`}>What happened</Label>
                      <Input
                        id={`timeline-what-${selectedTimelineIndex}`}
                        placeholder="Brief event summary"
                        value={timelineEvents[selectedTimelineIndex].description}
                        onChange={(e) =>
                          updateTimelineEvent(selectedTimelineIndex, "description", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`timeline-place-${selectedTimelineIndex}`}>Place (optional)</Label>
                      <Input
                        id={`timeline-place-${selectedTimelineIndex}`}
                        placeholder="Office floor / location"
                        value={timelineEvents[selectedTimelineIndex].place}
                        onChange={(e) =>
                          updateTimelineEvent(selectedTimelineIndex, "place", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {timelineError ? <p className="text-sm text-red-600">{timelineError}</p> : null}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || description.length < 10}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
