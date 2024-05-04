/**
 * This is the client-side code that uses the inferred types from the slickci-runner
 */
import {createTRPCClient, httpBatchLink} from '@trpc/client';
/**
 * We only import the `AppRouter` type from the slickci-runner - this is not available at runtime
 */
import type {AppRouter} from 'src/slickci-runner';
import jwt from 'jsonwebtoken';
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import * as fs from 'fs';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            // url: 'http://localhost:3000',
            url: 'http://184.105.162.189:3000',
        }),
    ],
});
//
// // Call procedure functions
//
// // 💡 Tip, try to:
// // - hover any types below to see the inferred types
// // - Cmd/Ctrl+click on any function to jump to the definition
// // - Rename any variable and see it reflected across both frontend and backend


function generateJWT(appId: string, privateKeyPath: string): string {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const payload = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (10 * 60),  // Token valid for 10 minutes
        iss: appId
    };
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

// const appId = '891230';
// const privateKeyPath = './src/slickci-scheduler/slickci-app.private-key.pem';
const appId = '890630';
const privateKeyPath = './src/slickci-scheduler/slickci.private-key.pem';
const token = generateJWT(appId, privateKeyPath);
console.log(token);

async function createRunnerToken(owner: string, appToken: string): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/actions/runners/registration-token`;
    const headers = {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        const response = await axios.post(url, {}, { headers });
        console.log('runner token: ' + response.data.token);  // This includes the token
        return response.data.token
    } catch (error) {
        console.error('Error creating runner token:', error);
        return ""
    }
}

async function getInstallationId(owner: string, repo: string, appToken: string): Promise<void> {
    const url = `https://api.github.com/repos/${owner}/${repo}/installation`;
    const headers = {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        const response = await axios.post(url, {}, { headers });
        console.log('installation id: ' + response.data.token);  // This includes the token
    } catch (error) {
        console.error('Error creating runner token:', error);
    }
}

async function getInstallationToken(installationId: string, appToken: string): Promise<string> {
    const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    const headers = {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        const response = await axios.post(url, {}, { headers });
        console.log('installation token: ' + response.data.token);  // This includes the token
        return response.data.token
    } catch (error) {
        console.error('Error creating installation token:', error);
        return ""
    }
}

// TypeScript interface to define the structure of GitHub repository objects
interface GitHubRepository {
    full_name: string;
}

// TypeScript interface to define the structure of the payload for installation-related events
interface GitHubInstallationEvent {
    action: string;
    installation: {
        id: string,
        account: {
            login: string;
        };
    };
    repositories: GitHubRepository[];
    repositories_added?: GitHubRepository[];
    repositories_removed?: GitHubRepository[];
}

const app = express();
app.use(bodyParser.json());
type Installation = {
    id: string,
    fullName: string
}

// Function to extract repository full names based on the event type
const extractRepoFullNames = (payload: GitHubInstallationEvent): Installation => {
    // @ts-ignore
    return {
        id: payload.installation.id,
        fullName: payload.repositories ? payload.repositories[0].full_name : payload.repositories_added[0].full_name
    };
};

// Route to handle incoming webhooks
app.post('/webhooks', async (req, res) => {
    const eventType = req.headers['x-github-event'] as string;
    const payload = req.body as GitHubInstallationEvent;

    if ((eventType === 'installation' || eventType === 'installation_repositories') && (payload.action === 'created' || payload.action === 'added')) {
        const repoFullNames = extractRepoFullNames(payload);
        console.log(`Repositories from event (${eventType}):`, repoFullNames);

// getInstallationId(owner, repo, appToken)
        const installationToken = await getInstallationToken(repoFullNames.id, token)
        const runnerToken = await createRunnerToken(repoFullNames.fullName, installationToken)

        const result = await trpc.scheduler.createWorkflow.mutate({
            commands: [
                "mkdir actions-runner && cd actions-runner",
                "apt-get update && apt-get install -y --no-install-recommends apt-utils && apt-get install -y curl",
                "curl -o actions-runner-linux-x64-2.316.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.316.0/actions-runner-linux-x64-2.316.0.tar.gz",
                "tar xzf ./actions-runner-linux-x64-2.316.0.tar.gz",
                'export RUNNER_ALLOW_RUNASROOT="1"',
                "./bin/installdependencies.sh",
                `export RUNNER_ALLOW_RUNASROOT="1" && ./config.sh --url https://github.com/${repoFullNames.fullName} --labels slickci-runner-01 --token ${runnerToken} --unattended`,
                'export RUNNER_ALLOW_RUNASROOT="1" && ./run.sh'
            ],
            cpu: "0.5",
            memory: "512Mi"
        });

        console.log('Workflow Result:', result);
    }

    res.status(200).send('Webhook received!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
