const fs = require('fs');
const path = require('path');
const { LE_BOT_USERNAME, BOT_MESSAGE } = require('./constants');
// TODO REVIEW: Can be text file too?
const { CLOSE_CONTRIBUTORS } = require('./close_contributors');

module.exports = async ({ github, context, core }) => {
  try {
    const issueNumber = context.payload.issue.number;
    const issueUrl = context.payload.issue.html_url;
    const issueTitle = context.payload.issue.title;
    const escapedTitle = issueTitle.replace(/"/g, '\\"');
    const commentId = context.payload.comment.id;
    const commentTime = new Date(context.payload.comment.created_at);
    const oneHourBefore = new Date(commentTime - 3600000);
    const commentAuthor = context.payload.comment.user.login;
    // TODO REVIEW: Ask Richard for security recommendations since anyone can comment on an issue
    const commentBody = context.payload.comment.body;
    const repo = context.repo.repo;
    const owner = context.repo.owner;
    // TODO REVIEW: Rename 'slackWebhookUrl' and 'communityWebhookUrl'
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    const communityWebhookUrl = process.env.SLACK_COMMUNITY_NOTIFICATIONS_WEBHOOK_URL;
    const keywordsPath = path.join(__dirname, 'keywords.txt');
    // TODO REVIEW: Cleanup duplicate keywords
    const keywordRegexes = fs.readFileSync(keywordsPath, 'utf-8')
      .split('\n')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
      .map(keyword => new RegExp(`\\b${keyword}\\b`, 'i'));

    /* console.log('issueNumber:', issueNumber);
    console.log('issueUrl:', issueUrl);
    console.log('issueTitle:', issueTitle);
    console.log('escapedTitle:', escapedTitle);
    console.log('commentId:', commentId);
    console.log('commentTime:', commentTime);
    console.log('oneHourBefore:', oneHourBefore);
    console.log('commentAuthor:', commentAuthor);
    console.log('commentBody:', commentBody);
    console.log('repo:', repo);
    console.log('owner:', owner);
    console.log('slackWebhookUrl:', slackWebhookUrl ? '[set]' : '[not set]');
    console.log('communityWebhookUrl:', communityWebhookUrl ? '[set]' : '[not set]');
    console.log('keywordsPath:', keywordsPath);
    console.log('keywordRegexes:', keywordRegexes.map(r => r.toString())); */

    async function hasLabel(name) {
        let labels = [];
        try {
          const response = await github.rest.issues.listLabelsOnIssue({
            owner,
            repo,
            issue_number: issueNumber
          });
          labels = response.data.map(label => label.name);
        } catch (error) {
           core.warning(`⚠️ Failed to fetch labels on issue #${issueNumber}: ${error.message}`);
           labels = [];
        }
        return labels.some(label => label.toLowerCase() === name.toLowerCase());
    }

    async function findRecentCommentsByUser(username) {
      try{
          let response = await github.rest.issues.listComments({
              owner,
              repo,
              issue_number: issueNumber,
              since: oneHourBefore.toISOString()
          });
          return response.data.filter(comment => comment.user.login === username);
      } catch (error) {
          core.warning(`⚠️ Failed to fetch comments on issue #${issueNumber}: ${error.message}`);
          return [];
      }
    }

    async function botReply(){
        let response = null;
        try {
            response = await github.rest.issues.createComment({
              owner,
              repo,
              issue_number: issueNumber,
              body: `Hi @${commentAuthor} ${BOT_MESSAGE}`
            });
            if (response?.data?.html_url) {
              // TODO REVIEW: Rename 'bot_replied' and 'botReplyMessage'
              core.setOutput('bot_replied', true);
              const botReplyMessage = `*[${repo}] <${response.data.html_url}|Bot response sent> on issue: <${issueUrl}|${escapedTitle}>*`;
              core.setOutput('bot_reply_message', botReplyMessage);
            }
        } catch (error) {
            core.warning(`Failed to post bot comment: ${error.message}`);
            core.setOutput('bot_replied', false);
        }
        return response;
    }

    if (await hasLabel('help wanted') || CLOSE_CONTRIBUTORS.includes(commentAuthor)) {
      core.setOutput('webhook_url', slackWebhookUrl);
    } else {
      core.setOutput('webhook_url', communityWebhookUrl);
      const matchedKeyword = keywordRegexes.find(regex => regex.test(commentBody));
      // post a bot reply if there is matched keyword and no previous bot comment in past hour
      if(matchedKeyword){
        // TODO REVIEW: unused varible
        let lastBotComment;

        // TODO REVIEW: Uppercase
        let PastBotComments = await findRecentCommentsByUser(LE_BOT_USERNAME);
        if(PastBotComments.length > 0){
          // TODO: REVIEW indentation
                lastBotComment = PastBotComments.at(-1);
                core.setOutput('bot_replied', false);
            } else if(PastBotComments.length === 0){
                // TODO REVIEW: Can remove 
                console.log("bot is replying");
                // TODO REVIEW: variable not needed
                lastBotComment = await botReply();
            }
      }
    }

    // TODO REVIEW: message and 'text' rename
    const message = `*[${repo}] <${issueUrl}#issuecomment-${commentId}|New comment> on issue: <${issueUrl}|${escapedTitle}> by ${commentAuthor}*`;
    core.setOutput('text', message);

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
};
