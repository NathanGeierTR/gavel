import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitHubAIService } from '../../services/github-ai.service';
import { GitHubPrService } from '../../services/github-pr.service';
import { MicrosoftCalendarService } from '../../services/microsoft-calendar.service';
import { MicrosoftTeamsService } from '../../services/microsoft-teams.service';

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './connections.component.html',
  styleUrl: './connections.component.scss'
})
export class ConnectionsComponent implements OnInit {
  // GitHub AI
  githubToken = '';
  githubModel = 'gpt-4o';
  githubModels: string[] = [];
  githubConnected = false;
  githubSaved = false;
  githubCallsUsed = 0;

  // Outlook Calendar
  calendarToken = '';
  calendarConnected = false;
  calendarSaved = false;

  // Microsoft Teams
  teamsToken = '';
  teamsConnected = false;
  teamsSaved = false;

  // GitHub Pull Requests
  githubPrToken = '';
  githubPrUsername = '';
  githubPrConnected = false;
  githubPrSaved = false;

  // Azure DevOps (status-only — full config lives in the ADO widget)
  adoConnected = false;
  adoProjects: { organization: string; project: string }[] = [];

  constructor(
    private aiService: GitHubAIService,
    private githubPrService: GitHubPrService,
    private calendarService: MicrosoftCalendarService,
    private teamsService: MicrosoftTeamsService
  ) {}

  ngOnInit(): void {
    this.loadStatuses();
  }

  private loadStatuses(): void {
    // GitHub AI
    this.githubToken = localStorage.getItem('github-ai-token') || '';
    this.githubModel = localStorage.getItem('github-ai-model') || 'gpt-4o';
    this.githubConnected = !!this.githubToken;
    this.githubModels = this.aiService.getAvailableModels();
    this.aiService.rateLimit$.subscribe(info => (this.githubCallsUsed = info.callsUsed));

    // Outlook Calendar
    this.calendarToken = localStorage.getItem('outlook-calendar-token') || '';
    this.calendarConnected = !!this.calendarToken;

    // Microsoft Teams
    this.teamsToken = localStorage.getItem('ms-teams-token') || '';
    this.teamsConnected = !!this.teamsToken;

    // GitHub Pull Requests
    this.githubPrToken = localStorage.getItem('github-pr-token') || '';
    this.githubPrUsername = localStorage.getItem('github-pr-username') || '';
    this.githubPrConnected = this.githubPrService.isConfigured();

    // Azure DevOps
    try {
      const raw = localStorage.getItem('ado-projects');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.adoProjects = parsed.map((p: any) => ({ organization: p.organization, project: p.project }));
        this.adoConnected = this.adoProjects.length > 0;
      }
    } catch {
      this.adoProjects = [];
    }
  }

  // GitHub AI
  saveGitHub(): void {
    const token = this.githubToken.trim();
    if (!token) return;
    this.aiService.initialize(token, this.githubModel);
    this.githubConnected = true;
    this.githubSaved = true;
    setTimeout(() => (this.githubSaved = false), 3000);
  }

  disconnectGitHub(): void {
    this.aiService.clearConfiguration();
    this.githubToken = '';
    this.githubConnected = false;
  }

  resetApiCounter(): void {
    if (confirm('Reset GitHub AI call counter to 0?')) {
      this.aiService.resetRateLimitInfo();
    }
  }

  // Outlook Calendar
  saveCalendar(): void {
    const token = this.calendarToken.trim();
    if (!token) return;
    this.calendarService.initialize(token);
    this.calendarConnected = true;
    this.calendarSaved = true;
    setTimeout(() => (this.calendarSaved = false), 3000);
  }

  disconnectCalendar(): void {
    this.calendarService.clearConfiguration();
    this.calendarToken = '';
    this.calendarConnected = false;
  }

  // Microsoft Teams
  saveTeams(): void {
    const token = this.teamsToken.trim();
    if (!token) return;
    this.teamsService.setAccessToken(token);
    this.teamsConnected = true;
    this.teamsSaved = true;
    setTimeout(() => (this.teamsSaved = false), 3000);
  }

  disconnectTeams(): void {
    this.teamsService.clearAccessToken();
    this.teamsToken = '';
    this.teamsConnected = false;
  }

  // GitHub Pull Requests
  saveGitHubPr(): void {
    const token = this.githubPrToken.trim();
    if (!token) return;
    this.githubPrService.initialize(token, this.githubPrUsername.trim());
    this.githubPrConnected = true;
    this.githubPrSaved = true;
    // Reflect auto-resolved username back into the field once the API call returns
    setTimeout(() => {
      this.githubPrUsername = this.githubPrService.getUsername();
      this.githubPrSaved = false;
    }, 3000);
  }

  disconnectGitHubPr(): void {
    this.githubPrService.clearConfiguration();
    this.githubPrToken = '';
    this.githubPrUsername = '';
    this.githubPrConnected = false;
  }
}
