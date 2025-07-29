const { CLOSE_CONTRIBUTORS } = require('./constants');

module.exports = async ({ core, github, context, username }) => {
  if (CLOSE_CONTRIBUTORS.includes(username)) {
    core.info(`User '${username}' found in the CLOSE CONTRIBUTORS list.`);
    core.setOutput('is_close_contributor', true);
    return;
  }

  const org = context.repo.owner;
  const teamsToCheck = ['gsoc-contributors', 'learning-equality-community-guide'];

  const promises = teamsToCheck.map(team_slug =>
    github.rest.teams.getMembershipForUserInOrg({
      org,
      team_slug,
      username,
    })
  );

  try {
    const results = await Promise.allSettled(promises);
    let isTeamMember = false;

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.data.state === 'active') {
        isTeamMember = true;
        break;
      }

      if (result.status === 'rejected' && result.reason.status !== 404) {
        throw new Error(`API Error: ${result.reason.message}`);
      }
    }

    if (isTeamMember) {
      core.info(`User '${username}' was found to be a member of a monitored team.`);
    }

    core.setOutput('is_close_contributor', isTeamMember);

  } catch (error) {
    core.setFailed(error.message);
  }
};