# Development

## Pre-requisites

- [Node.js](https://nodejs.org/) version 22 installed on your machine.
  If you have nvm installed, you can run the following command to install and use the required version:
  ```shell
  cat .nvmrc | nvm install && nvm use
  ```
- [Adobe I/O CLI](https://developer.adobe.com/runtime/docs/guides/tools/cli_install/) installed on your machine.
- Access to the [Adobe Developer Console](https://console.adobe.io/) with an organization having a license to use App
  Builder. If you don't have access to the Adobe Developer Console or App Builder, you can check
  out [Get access to App Builder](https://developer.adobe.com/app-builder/docs/overview/getting_access/#get-access-to-app-builder).

## Initial configuration (when this is promoted to a github, to be kept in CEXT-3863)

1. Create a folder for your project and navigate to it.
2. Execute the following command to select or create the Adobe Developer Console project in your organization and use
   the Commerce checkout starter kit to quick start the code:
   ```shell
   aio app init --repo adobe/commerce-checkout-starter-kit --github-pat $GITHUB_PAT
   ```
   Replace `$GITHUB_PAT` with your GitHub personal access token.
   See [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
   for more information.
3. The starter kit requires the following services to be added in the console project:
   - I/O Management API
   - I/O Events
   - Adobe I/O Events for Adobe Commerce
     Execute the following command to add the services by selecting them from the list:
   ```shell
   aio app add service
   ```

## Initial configuration (for internal use while this is in gitcorp, to be removed in CEXT-3863)

Sadly the command `aio app init` with `--repo` option is not available for gitcorp repos, so we need to do extra steps
until the repo is moved into Adobe's GitHub org.

1. Clone this repository and run `npm install` from the project root directory.
2. Create a new project with AppBuilder template in Stage environment of the Adobe Developer Console https://developer-stage.adobe.com/console
3. Execute the following command to configure locally the Adobe Developer Console project:
   ```shell
   aio logout # (Optional) to logout from any previous session
   export AIO_CLI_ENV=stage && aio login
   aio console org select
   aio console project select
   aio console workspace select
   aio app use --global --merge
   ```
4. Execute the following command to add the required services to the Adobe Developer Console project:
   ```shell
   # Select I/O Management API, I/O Events, Adobe I/O Events for Adobe Commerce
   aio app add service
   ```
   Example output:
   ```shell
   Workspace Stage currently subscribes to the following services:
    []
    ? Add new Services to the Workspace Stage? Add new Services
    ? Add Services to Workspace Stage I/O Management API, Adobe I/O Events for Adobe Commerce, I/O Events
    ? Workspace Stage will have the following Services attached:
    [
    "I/O Management API",
    "Adobe I/O Events for Adobe Commerce",
    "I/O Events"
    ]
    > Confirm and Save ? Yes
    ? The file /commerce-extensibility/test/.env already exists: Overwrite
    ? The file /commerce-extensibility/test/.aio already exists: Overwrite
    Successfully updated Service Subscriptions in Workspace Stage
   ```

To run the project locally, you can use the following commands

```shell
# Run the project locally on localhost:9080
aio app dev

# Run the project locally but deploying runtime actions in the configured console project
aio app run
```

See [aio app dev vs. aio app run](https://developer.adobe.com/app-builder/docs/guides/development/#aio-app-dev-vs-aio-app-run) for more information.

Additionally, you can see the [deployment documentation](https://developer.adobe.com/app-builder/docs/guides/deployment/) to see what is happening in `app dev`, `app run` and `app deploy`.

## Testing

Jest is used as Testing Framework and execution is based on the `aio` CLI.

```shell
# Run unit tests for ui and actions
aio app test

# Run e2e tests
aio app test --e2e
```

Note no relevant testing has been implemented for this starter kit project since it is just a template. Current tests
are only examples of how to use the available tooling.

## Linting and formatting

Prettier and ESLint are used to enforce code style and formatting. The following commands are available for such tasks:

```shell
# Checks linting
npm run lint:check
# Fixes linting
npm run lint:fix

# Checks format
npm run format:check
# Fixes format
npm run format:fix

# Checks both linting and format
npm run code:check
# Fixes both linting and format
npm run code:fix
```

See the following links to configure formatting according to your IDE preference:

- VS Code: https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode
- Jetbrains IDEs: https://blog.jetbrains.com/webstorm/2016/08/using-external-tools/

## Debugging

See the following link for more information on how to debug your application:
https://developer.adobe.com/app-builder/docs/guides/development/#debugging

### Deploy & Cleanup

Deployment is done using the `aio` CLI.

```shell
# Builds and deploys all actions on Runtime and static files to CDN
aio app deploy

# Undeploy the app
aio app undeploy
```
