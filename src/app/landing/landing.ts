import { Component } from '@angular/core';

/**
 * The landing page. Its whole job is to say what the platform is, in text that is present in the
 * SERVER-RENDERED html — that is the `-app` archetype's definition of done, and it is why every
 * string below is in the template rather than fetched.
 */
@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly capabilities = [
    {
      title: 'Repositories and tickets',
      body: 'Every repository, epic, ticket and release request lives in one catalogue, so the work and the code it changes are one thing rather than two.',
    },
    {
      title: 'Continuous integration',
      body: 'A release request is folded, gated and approved by a person before anything ships. A green branch is not a release.',
    },
    {
      title: 'Releases and deployments',
      body: 'A release is a version coordinate. What deploys is that version, into the tier it enters at, gated on a health probe.',
    },
    {
      title: 'Artifacts and observability',
      body: 'One store for the bytes the platform produces, and one place to read what the platform did with them.',
    },
  ];
}
