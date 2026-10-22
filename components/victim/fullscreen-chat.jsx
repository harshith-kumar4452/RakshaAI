"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send } from "lucide-react";

export function FullscreenChat({
  caseId,
  complaintId,
  initialDescription,
  onTriageComplete,
  onClose,
}) {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [triageData, setTriageData] = useState(null);
  const [fraudDetected, setFraudDetected] = useState(false);
  const [currentCredibility, setCurrentCredibility] = useState(null);
  const messagesEndRef = useRef(null);

  // Start triage on mount
  useEffect(() => {
    startTriage();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startTriage() {
    setIsProcessing(true);

    try {
      const response = await fetch("/api/complaints/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintId,
          messages: [],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages([
          {
            role: "assistant",
            content: data.error || "Triage service failed. Please try again.",
          },
        ]);
        return;
      }

      if (data.isComplete) {
        setTriageData(data.extractedData);
        onTriageComplete(data.extractedData);
      } else {
        setMessages([{ role: "assistant", content: data.message }]);
      }
    } catch (error) {
      console.error(error);
      setMessages([
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleSendMessage() {
    if (!userInput.trim() || isProcessing) return;

    const newMessages = [...messages, { role: "user", content: userInput }];
    setMessages(newMessages);
    setUserInput("");
    setIsProcessing(true);

    try {
      const response = await fetch("/api/complaints/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintId,
          messages: newMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.error || "Failed to save extracted fields. Please try again.",
          },
        ]);
        return;
      }

      if (data.isComplete) {
        if (data.fraudDetected) {
          setFraudDetected(true);
          setMessages([...newMessages, { role: "assistant", content: data.message }]);
        } else {
          setTriageData(data.extractedData);
          setMessages([...newMessages, { role: "assistant", content: "Thank you. I have all the information I need." }]);
          onTriageComplete(data.extractedData);
        }
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
        if (data.currentCredibility !== undefined) {
          setCurrentCredibility(data.currentCredibility);
        }
      }
    } catch (error) {
      console.error(error);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Case Triage Assistant</h2>
          <p className="text-sm text-muted-foreground">
            Case ID: <span className="font-mono font-bold">{caseId}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={!triageData}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Initial description display */}
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
              Your Initial Report
            </p>
            <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
              {initialDescription}
            </p>
          </div>

          {/* Conversation messages */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  msg.role === "assistant"
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-3">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/60" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/60 [animation-delay:0.2s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/60 [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}

          {/* Triage complete message */}
          {triageData && (
            <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950">
              <p className="mb-2 text-sm font-semibold text-green-900 dark:text-green-100">
                ✓ Report Submitted Successfully
              </p>
              <div className="grid gap-2 text-sm text-green-800 dark:text-green-200">
                <p>
                  Thank you for providing the necessary information. Your case has been securely logged with the system.
                  Our team will review the details and get back to you shortly.
                </p>
                <p className="font-medium mt-2">
                  Please save your Case ID for future reference: <span className="font-bold">{caseId}</span>
                </p>
              </div>
              <Button onClick={onClose} className="mt-4 w-full" size="sm">
                Return to Dashboard
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {!triageData && (
        <div className="border-t bg-muted/20 px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              placeholder="Type your response... (Press Enter to send)"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              rows={2}
              className="resize-none"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!userInput.trim() || isProcessing}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
