"use strict";

const i18n = require("../../api/common/i18n");
const publicConfig = require("../../config/publicConfig");
const sqlHelper = require("../../api/common/sqlHelper");
const mailConfig = require("../../config/as_mail");

const handlebars = require("handlebars");
const nodemailer = require("nodemailer");
const fs = require("fs");
const cheerio = require("cheerio");
const Q = require("q");
const r_url = require("url");

const {baseUrl} = publicConfig;
const cdnUrl = publicConfig.cdn.host;

function textToExtract($txt) {
    let indexOfLastSpace;

    if ($txt) {
        // Delete all tags
        $txt = $txt.replace(/<(?:.|\n)*?>/gm, "");

        if ($txt.length > 200) {
            $txt = $txt.substring(0, 200 - 3 + 1);

            indexOfLastSpace = $txt.lastIndexOf(" ");
            if (indexOfLastSpace >= 0) {
                $txt = `${$txt.substring(0, indexOfLastSpace)}...`;
            }
        }
    }

    return $txt;
}

/*
 * return an object
 * {
 *    mailAddress: "value",
 *    isOkWithNotif: "booleanValue
 * }
 *
 */
function _pGetMailFromAccountId($accountId, $category) {
    let query;

    if ($category === "producer" || $category === "buyer") {
        if ($category === "producer") {
            query = `${"SELECT \"Producer\".\"mainContactEmailAddress\", " +
                "\"Producer\".\"_isOkWithNotif\", \"Account\".\"preferredLanguage\" FROM \"Producer\", \"Account\"" +
                "WHERE \"Producer\".\"id\" = \"Account\".\"id\" AND \"Producer\".\"id\" = "}${$accountId}`;
        } else {
            query = `${"SELECT \"Buyer\".\"emailAddress\", " +
                "\"Buyer\".\"_isOkWithNotif\", \"Account\".\"preferredLanguage\" FROM \"Buyer\", \"Account\"" +
                "WHERE \"Buyer\".\"id\" = \"Account\".\"id\" AND \"Buyer\".\"id\" = "}${$accountId}`;
        }

        return sqlHelper.pSqlRequest(query).then(($result) => {
            return {
                language: $result[0].preferredLanguage,
                mailAddress: $result[0].mainContactEmailAddress || $result[0].emailAddress,
                isOkWithNotif: $result[0]._isOkWithNotif,
                id: $accountId
            };
        }).catch((error) => {
            console.error(`can't retrieve the mail address for: ${$accountId} because: ${error}`);
        });
    } else {
        //TODO: the same for the buyer mail when we need it
        throw "unimplemented yet, do it yourself";
    }
}

function _pGetAllMail($mailOptions) {
    const query = sqlHelper.sqlLoad("mail_filter", $mailOptions);

    return sqlHelper.pSqlRequest(query).catch((error) => {
        console.error(`can't retrieve the mail addresses because: ${error}`);
    });
}

function sendAdminEmail($tags, $htmlContent) {
    let mailOptions, smtpTransport, tagStr = "";

    if ($tags) {
        if (!Array.isArray($tags)) {
            $tags = [$tags];
        }

        tagStr = "[" + $tags.join("][") + "]";
    }

    mailOptions = {
        from: "no-reply@altshift.fr",
        to: mailConfig.adminMail,
        subject: "[whinehub]" + tagStr + " from " + baseUrl,
        html: $htmlContent
    };

    smtpTransport = nodemailer.createTransport(mailConfig.transportAdminConfig);

    // Send mail with defined transport object
    smtpTransport.sendMail(mailOptions, function (error, response) {
        smtpTransport.close();
        if (error) {
            console.error(JSON.stringify(error));
        }
    });
}

function mailError($error, $mailConfig, $mailObject) {
    let htmlContent;

    if ($error.ValidationError) {
        $error = new Error(JSON.stringify($error, null, 4));
    } else if (!($error instanceof Error)) {
        $error = new Error($error);
    }
    // Display error
    console.error("## Problem during the mail sending: " + $error.stack);

    // Try sending a mail to alert of the error

    htmlContent = "error:" + $error.stack.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");

    if ($mailConfig) {
        htmlContent += "<br><br> Problem during the mail sending: <br>" + JSON.stringify($mailConfig, null, 4).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
        if ($mailObject) {
            htmlContent += "<br><br>for mail object : <br>" + JSON.stringify($mailObject, null, 4).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
        }
    }

    sendAdminEmail(["error", "mailSender"], htmlContent);
}

/**
 * @param $outputConfig
 * @options mailTemplate: "views/mailTemplate/test_template.hbs"
 * @options mailTemplate: "views/mailTemplate/test_template.hbs"
 * @options mailData": {
 *		"title": {key :"mail.title.validatedAccount"},
 *		"content": { key :"mail.content.validatedAccount",
 *			values: function(){
 *				return { login: "fakelogin", password: "p455w0RD"};
 *			}
 *	}
 * @options to "toto@gmail.com",
 * @options mailSubject "mail.subject.validatedAccount"
 */
function _sendMail($outputConfig, $targetObjectId) {
    let smtpTransport, toResult, pAsyncValueResult,
        contentValuesResult, mailSubjectResult, actionResult, titleValuesResult;
    smtpTransport = nodemailer.createTransport(mailConfig.transportConfig);

    // ********************* PreconditionCheck *************

    if (!$outputConfig) {
        mailError("Cannot send notification, parameters are empty.");

        return;
    } else if (!$outputConfig.mailData) {
        mailError("Cannot send notification, missing mailData in parameters.", $outputConfig);

        return;
    } else if (!$outputConfig.mailData.title) {
        mailError("Cannot send notification, missing mailData.title in parameters.", $outputConfig);

        return;
    } else if (!$outputConfig.mailData.content) {
        mailError("Cannot send notification, missing mailData.content in parameters.", $outputConfig);

        return;
    } else if (!$outputConfig.to) {
        mailError("Cannot send notification, missing \"to\" in parameters.", $outputConfig);

        return;
    } else if (!$outputConfig.mailSubject) {
        mailError("Cannot send notification, missing \"mailSubject\" in parameters.", $outputConfig);

        return;
    } else if (!$outputConfig.mailData.action) {
        mailError("Cannot send notification, missing \"mailData.action\" in parameters.", $outputConfig);

        return;
    }

    //********************* Function logic
    if (typeof $outputConfig.to === "function") {
        toResult = $outputConfig.to();
    } else {
        toResult = $outputConfig.to;
    }
    if (typeof $outputConfig.mailData.pAsyncValue === "function") {
        pAsyncValueResult = $outputConfig.mailData.pAsyncValue();
    } else {
        pAsyncValueResult = $outputConfig.mailData.pAsyncValue;
    }
    if (typeof $outputConfig.mailSubject === "function") {
        mailSubjectResult = $outputConfig.mailSubject();
    } else {
        mailSubjectResult = $outputConfig.mailSubject;
    }
    if (typeof $outputConfig.mailData.action === "function") {
        actionResult = $outputConfig.mailData.action();
    } else {
        actionResult = $outputConfig.mailData.action;
    }
    if (typeof $outputConfig.mailData.title.values === "function") {
        titleValuesResult = $outputConfig.mailData.title.values();
    } else {
        titleValuesResult = $outputConfig.mailData.title.values;
    }
    if (typeof $outputConfig.mailData.content.values === "function") {
        contentValuesResult = $outputConfig.mailData.content.values();
    } else {
        contentValuesResult = $outputConfig.mailData.content.values;
    }

    Q.all([
        toResult,
        pAsyncValueResult,
        mailSubjectResult,
        actionResult,
        titleValuesResult,
        contentValuesResult
    ]).then(($$result) => {
        let to = $$result[0],
            asyncValue = $$result[1],
            mailSubject = $$result[2],
            action = $$result[3].label,
            titleValues = $$result[4],
            contentValues = $$result[5],
            date = new Date(),
            customValues = $outputConfig.mailData.customValues,
            i;

        date = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

        if (Array.isArray(to)) {
            to.forEach((_dest, _index) => {
                setTimeout(() => {
                    sendToDest(_dest);
                }, 75 * _index);
            });
        } else {
            sendToDest(to);
        }

        function sendToDest($to) {
            const templateValues = {};
            // Is the user is ok with email notification
            if ($to.isOkWithNotif === true) {
                // Set language for mail
                i18n.pSetLanguage($to.language || "fr").then(() => {
                    let attrname;
                    const mergedValues = {};
                    // Translate and build mail
                    templateValues.title = i18n.translate($outputConfig.mailData.title.key, titleValues);
                    if (i18n.exists(`${$outputConfig.mailData.title.key}.text`)) {
                        templateValues.titleTxt = i18n.translate(`${$outputConfig.mailData.title.key}.text`, titleValues);
                    } else {
                        templateValues.titleTxt = templateValues.title;
                    }

                    templateValues.content = i18n.translate($outputConfig.mailData.content.key, contentValues);
                    if (i18n.exists(`${$outputConfig.mailData.content.key}.text`)) {
                        for (attrname in customValues) {
                            mergedValues[attrname] = customValues[attrname];
                        }
                        for (attrname in contentValues) {
                            mergedValues[attrname] = contentValues[attrname];
                        }
                        templateValues.contentTxt = i18n.translate(
                            `${$outputConfig.mailData.content.key}.text`,
                            mergedValues
                        );
                    } else {
                        templateValues.contentTxt = templateValues.content;
                    }

                    templateValues.actionLabel = i18n.translate(action);
                    templateValues.actionUrl = $outputConfig.mailData.action.url;
                    templateValues.value = $outputConfig.mailData.value;
                    templateValues.listTitle = $outputConfig.mailData.listTitle
                        && i18n.translate($outputConfig.mailData.listTitle.key);
                    templateValues.date = date;
                    templateValues.imgSrc = `${cdnUrl}/logo.png`;
                    templateValues.notifParameterUrl = r_url.resolve(baseUrl, "/#/manage-password");
                    templateValues.asyncValue = asyncValue;

                    if (customValues) {
                        for (const k in customValues) {
                            if (customValues[k] && customValues[k].key) {
                                templateValues[k] = i18n.translate(customValues[k].key);
                            } else {
                                templateValues[k] = customValues[k];
                            }
                        }
                    }
                    _createHtmlTemplate(
                        $outputConfig.mailTemplate,
                        templateValues, $outputConfig.mailLayout
                    ).then(($html) => {
                        // & apos is not compatible with older client, we prefer &#39; for apostrophe wich is
                        $html = $html.replace(/&apos;/g, "&#39;");

                        // Setup e-mail data
                        const mailOptions = {
                            from: mailConfig.defaultFrom,
                            to: $to.mailAddress,
                            subject: i18n.translate(mailSubject),
                            text: `${templateValues.titleTxt}.\r\n${templateValues.contentTxt}`,
                            html: $html
                        };

                        return pLogMail(mailOptions, $to.id, mailSubject, $targetObjectId).then(($mail) => {
                            // Log has been created properly

                            // Overload the href of the mail to redirect and log them properly
                            $html = _overloadHtmlRef($html, $to.id, $mail.id);
                            // &apos; is not compatible with outlook and ie8, we replace it with an ascii code of apostrophe that is compatible with all clients
                            $html = $html.replace(/&apos;/g, "&#39;");
                            // Setup e-mail data
                            mailOptions.html = $html;


                            if (!mailOptions.to) {
                                mailError("Cannot send email without mail", mailOptions);
                            } else {
                                smtpTransport.sendMail(mailOptions, (error) => {
                                    //smtpTransport.close();
                                    if (error) {
                                        $mail.error = error.message;
                                        $mail.save(($$error) => {
                                            if ($$error) {
                                                console.log("saving the log mail when an error during the send occured went wront", $$error);
                                            }
                                        });
                                        console.log("error during smtp smtpTransport.sendMail");
                                        mailError(new Error(error), null, $mail);
                                    } else {
                                        $mail.hasBeenSent = true;
                                        $mail.save(($$error, $result) => {
                                            if ($$error) {
                                                console.log("saving the log mail when an error during the send occured went wront", $$error);
                                            }
                                        });

                                        console.log(`Mail sent to \"${mailOptions.to}\" with subject \"${mailOptions.subject}\"`);
                                    }
                                });
                            }
                        });
                    }).catch(($error) => {
                        mailError($error, $outputConfig);
                    });
                });
            } // if ($to.isOkWithNotif === true)
        }
    }).catch((error) => {
        console.error(`something failed while retrieving the data needed to contruct the notification mail${error}`);
    });
}

function _createRedirectionUrl($url, $toId, $mailId, $actionType = "click") {
    const urlDesc = {
        pathname: "api/stat/logAction",
        query: {
            targetType: "mail",
            ref_target: $mailId,
            params: [$url],
            actionType: $actionType,
            redirectionUrl: $url
        }
    };
    if ($toId != null) {
        urlDesc.query.ref_account = $toId;
    }
    const redirectUrl = r_url.resolve(baseUrl, r_url.format(urlDesc));

    return redirectUrl;
}

// call the function createRedirectionUrl for each <a> in the html parameter
function _overloadHtmlRef($html, $toId, $mailId) {
    const $ = cheerio.load($html);

    $("a").each(function (i, elem) {
        const withoutMailTo = !$(this).attr("href").includes("mailto");

        if (withoutMailTo) {
            $(this).attr("href", _createRedirectionUrl($(this).attr("href"), $toId, $mailId));
        }
    });

    return $.html();
}



// log the data about sent mail
function pLogMail($mailOptions, $ref_account, $subject, $targetObjectId) {
    const mail = {};

    mail.ref_account = $ref_account || 0;
    mail.from = $mailOptions.from;
    mail.to = $mailOptions.to;
    mail.subject = $subject;
    if ($subject === "mail.subject.validatedAccount" || $subject === "mail.subject.changePassword") {
        mail.text = "Not stored for privacy and security reasons";
        mail.html = "Not stored for privacy and security reasons";
    } else {
        mail.text = $mailOptions.text;
        mail.html = $mailOptions.html;
    }

    mail.hasBeenSent = false;
    mail.targetObjectId = $targetObjectId;

    if (!mail.to) {
        console.error("there should be an id >0, if not there is an error in the mail notif strategies, you need to look into it");
    }

    const mailPromise = global.Mail.create(mail);

    return mailPromise;
}

//return a promise of an html for a given data and a givent templateURI
function _createHtmlTemplate($templateURI, $data, $layoutURI) {
    const deferred = Q.defer();

    if ($layoutURI) {
        fs.readFile($templateURI, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                let source = data.toString(),
                    template = handlebars.compile(source),
                    content = template($data);

                fs.readFile($layoutURI, (err, data) => {
                    if (err) {
                        deferred.reject(err);
                    } else {
                        let source = data.toString(),
                            template = handlebars.compile(source),
                            ret, layoutData;

                        layoutData = $data;
                        layoutData.contentHtml = new handlebars.SafeString(content);
                        ret = template(layoutData);
                        deferred.resolve(ret);
                    }
                });
            }
        });
    } else {
        fs.readFile($templateURI, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                let source = data.toString(),
                    template = handlebars.compile(source),
                    result = template($data);
                deferred.resolve(result);
            }
        });
    }

    return deferred.promise;
}

module.exports = {
    _sendMail,
    _createHtmlTemplate,
    _pGetAllMail,
    _pGetMailFromAccountId,
    textToExtract
};


