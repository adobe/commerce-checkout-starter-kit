# CI/CD

## Workflow Samples

Three different workflow samples are provided to implement the continuous integration using the Github Actions feature.

### deploy_prod.yml

This workflow is triggered on a release event ([Github Events that trigger Workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#release)), specifically when a release is marked as released and defines a single job called deploy, which performs the following steps sequentially to deploy the application to production.

1. Environment Setup: 
   - [Matrix Strategy](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow#about-matrix-strategies): The job runs on Ubuntu (ubuntu-latest) using Node.js version 20. It is configured to allow only one parallel execution (max-parallel: 1) and executes the following steps:
     - Checkout Code: Retrieves the code from the repository using actions/checkout.
     - Setup Node.js: Configures the specified Node.js version (20) and runs a code check.
2. npm Install: Installs the required dependencies for the application.
3. CLI Setup:
   Installs and configures the `Adobe I/O CLI` tool using the `adobe/aio-cli-setup-action` action.
4. Authentication:
   Authenticates with `Adobe I/O` using secure credentials stored as secrets (e.g., CLIENTID_PROD, CLIENTSECRET_PROD). Visit [Secrets in Github Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#about-secrets) to configure the variables as secrets.
5. Build Process:
   Builds the application using the build command from the adobe/aio-apps-action.
6. Deployment:
   Deploys the application to production using the **deploy** command. Relevant credentials (e.g., AIO_RUNTIME_NAMESPACE, AIO_RUNTIME_AUTH) and project details (e.g., AIO_PROJECT_NAME, AIO_PROJECT_WORKSPACE_NAME) are securely provided as environment variables which need to be configured accordingly.


### deploy_stage.yml

Overall this workflow is similar to the previous one. The key differences are:
1. The workflow is triggered on a `push` to the `main` branch.
2. Authentication and deployments secrets are staging-specific which means these need to be defined separately for this environment.


### pr_test.yml

This workflow is triggered when a pull request is opened, updated, or synchronized ([Pull request event](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request)) and is intended to test the changes in the pull request across multiple operating systems and Node.js versions before merging into the main branch.

During the testing Process it performs the following steps:

1. Environment Setup: Checks out the code using actions/checkout and configures Node.js (actions/setup-node).
2. Dependency Installation: Installs necessary dependencies with `npm i`.
3. CLI Setup: Installs and configures the `Adobe I/O CLI` tool.
4. Authentication: Authenticates using staging-specific credentials stored in GitHub secrets, ensuring secure access to `Adobe I/O` services.
5. Build Process: Builds the application to ensure all components compile successfully.
6. Testing: Runs the `test` command via `adobe/aio-apps-action` to validate functionality.