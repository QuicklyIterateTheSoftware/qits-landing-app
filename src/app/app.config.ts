import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { client as projectsClient } from './api/projects/client.gen';
import { provideHeyApiClient } from './api/projects/client/client.gen';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    // Each generated client sends its calls through this app's HttpClient.
    provideHeyApiClient(projectsClient),
  ],
};
