"use strict";

const i18n = require("../../api/common/i18n");
const publicConfig = require("../../config/publicConfig");
const {pSqlRequest, sqlLoad} = require("../../api/common/sqlHelper");
const mailConfig = require("../../config/as_mail");
const {registerHelpers} = require("./handlebarsHelper");

const handlebars = require("handlebars");
const nodemailer = require("nodemailer");
const fs = require("fs");
const cheerio = require("cheerio");
const Q = require("q");
const r_url = require("url");

const {baseUrl} = publicConfig;
const cdnUrl = publicConfig.cdn.host;

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

    $("a").each(function (i) {
        const withoutMailTo = !$(this).attr("href").includes("mailto");

        if (withoutMailTo) {
            $(this).attr("href", _createRedirectionUrl($(this).attr("href"), $toId, $mailId));
        }
    });

    return $.html();
}

//return a promise of an html for a given data and a givent templateURI

function _createHtmlTemplate($templateURI, $data, $layoutURI) {
    const deferred = Q.defer();

    if ($layoutURI) {
        fs.readFile($templateURI, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                registerHelpers(handlebars);

                const source = data.toString();
                const template = handlebars.compile(source);
                const content = template($data);

                fs.readFile($layoutURI, (_err, _data) => {
                    if (_err) {
                        deferred.reject(_err);
                    } else {
                        const layoutSource = _data.toString();
                        const layoutTemplate = handlebars.compile(layoutSource);

                        let ret;

                        const layoutData = $data;

                        layoutData.contentHtml = new handlebars.SafeString(content);
                        ret = layoutTemplate(layoutData);
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
                const source = data.toString();
                const template = handlebars.compile(source);
                const result = template($data);

                deferred.resolve(result);
            }
        });
    }

    return deferred.promise;
}

const blankCharacterRegex = /\s/;
function textToExtract($txt, $sizeMax) {
    var indexOfLastSpace;

    if ($sizeMax === undefined || $sizeMax === null )
    {
        $sizeMax = 200;
    }

    if ($txt) {
        // Delete all tags
        $txt = $txt.replace(/<(?:.|\n)*?>/gm, "");

        // Replace line
        $txt = $txt.replace(/\r\n/g, "\n");
        let wordSize = 0;
        for(let i = 0; i < $txt.length; i++) {
            if (!blankCharacterRegex.test($txt[i])) {
                wordSize++;
                if (wordSize > 30) { // Avoid line too long that can be problematic for the mail formating
                    $txt = $txt.slice(0, i) + " " + $txt.slice(i);
                    wordSize = 0;
                }
            } else {
                wordSize = 0;
            }
        }

        $txt = $txt.replace(/\n/g, "<br>");
        $txt = $txt.replace(/\r/g, "<br>");


        if ($txt.length > $sizeMax) {
            $txt = $txt.substring(0, ($sizeMax - 3) + 1);

            indexOfLastSpace = $txt.lastIndexOf(" ");
            if (indexOfLastSpace >= 0) {
                $txt = $txt.substring(0, indexOfLastSpace) + "...";
            }
        }


    }
    //QQQQQQQQQQQQ<br>QQQQQQQQQQQQ<br><br>QQQQ QQQQQQQQQ<br><br>QQQQQQQQQQQQQQ
    return $txt;

    //    var extract = $txt;
    //
    //    if (extract) {
    //        extract = extract.replace(/<(?:.|\n)*?>/gm, "");
    //        if (extract.length > 200) {
    //            extract = extract.substring(0, 200) + "...";
    //        }
    //    }
    //    return extract;
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

        return pSqlRequest(query).then(($result) => {
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
    const query = sqlLoad("mail_filter", $mailOptions);

    return pSqlRequest(query).catch((error) => {
        console.error(`can't retrieve the mail addresses because: ${error}`);
    });
}

function sendAdminEmail($tags, $htmlContent) {
    let tagStr = "";

    if ($tags) {
        if (!Array.isArray($tags)) {
            $tags = [$tags];
        }

        tagStr = "[" + $tags.join("][") + "]";
    }

    const mailOptions = {
        from: "no-reply@altshift.fr",
        to: mailConfig.adminMail,
        subject: `[foodOrWineHub]${tagStr} from ${baseUrl}`,
        html: $htmlContent
    };

    const smtpTransport = nodemailer.createTransport(mailConfig.transportAdminConfig);

    // Send mail with defined transport object
    smtpTransport.sendMail(mailOptions, (error) => {
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
    console.error(`## Problem during the mail sending: ${$error.stack}`);

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

function pSendToDest($to, $outputConfig, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, delay) {
    const defer = Q.defer();
    setTimeout(() => {
        const templateValues = {};
        // Is the user is ok with email notification
        if (($outputConfig.mailData.withUnsubscribe && $to.isOkWithNotif === true) || (!$outputConfig.mailData.withUnsubscribe)) {
            templateValues.language = $to.language || "fr";
            // Set language for mail
            i18n.pSetLanguage(templateValues.language).then(() => {
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
                if (templateValues.actionUrl) {
                    templateValues.actionUrl = templateValues.actionUrl.replace(/([^:])\/\//g, "$1/");
                }
                templateValues.value = $outputConfig.mailData.value;
                templateValues.listTitle = $outputConfig.mailData.listTitle
                    && i18n.translate($outputConfig.mailData.listTitle.key);
                templateValues.date = date;
                templateValues.imgSrc = `${cdnUrl}/logo.png`;
                templateValues.notifParameterUrl = r_url.resolve(baseUrl, "/#/manage-password");
                templateValues.asyncValue = asyncValue;

                if($outputConfig.mailData.withUnsubscribe){
                    templateValues.withUnsubscribe = true;
                    var encodedId = (new Buffer(""+$to.id)).toString('base64');

                    templateValues.unsubscribeUrl = r_url.resolve(baseUrl, "/api/account/unsubscribe?lang="+ $to.language + "&hash=" + encodedId);
                    templateValues.unsubscribeText = i18n.translate("mail.unsubscribe.link.text");
                    templateValues.rgpdText = i18n.translate("mail.rpgd.text");
                }

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
                            const error = new Error("Cannot send email without mail destinataires");
                            mailError(error, mailOptions, $mail);
                            defer.reject(error);
                        } else {
                            smtpTransport.sendMail(mailOptions, (error) => {
                                //smtpTransport.close();
                                if (error) {
                                    $mail.error = error.message;
                                    $mail.save(($$error) => {
                                        if ($$error) {
                                            console.log("Saving the mail log error when an error during the send occured: ", $$error);
                                        }
                                    });
                                    console.log("error during smtp smtpTransport.sendMail");
                                    mailError(new Error(error), null, $mail);
                                    defer.reject(error);
                                } else {
                                    $mail.hasBeenSent = true;
                                    $mail.save(($$error) => {
                                        if ($$error) {
                                            console.log("Saving the mail log success when an error during the send occured: ", $$error);
                                        }
                                    });
                                    defer.resolve();

                                    console.log(`Mail sent to \"${mailOptions.to}\" (${templateValues.language}) with subject \"${mailOptions.subject}\"`);
                                }
                            });
                        }
                    });
                }).catch(($error) => {
                    console.log("error during _createHtmlTemplate");
                    mailError($error, $outputConfig);
                    defer.reject($error);
                });
            });
        } // if ($to.isOkWithNotif === true)
    }, delay);// setTimeout

    return defer.promise;
}

function IsRecetteMail($mailAddress) {
    return $mailAddress && $mailAddress.indexOf("recette_") === 0;
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
    let toResult, pAsyncValueResult,
        contentValuesResult, mailSubjectResult, actionResult, titleValuesResult;
    const smtpTransport = nodemailer.createTransport(mailConfig.transportConfig);

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

    if ($outputConfig.mailData.customValues) {
        for (const k in $outputConfig.mailData.customValues) {
            if ($outputConfig.mailData.customValues.hasOwnProperty(k)) {
                if (typeof $outputConfig.mailData.customValues[k] === "function") {
                    $outputConfig.mailData.customValues[k] = $outputConfig.mailData.customValues[k]();
                }
            }
        }
    }

    Q.all([
        toResult,
        pAsyncValueResult,
        mailSubjectResult,
        actionResult,
        titleValuesResult,
        contentValuesResult
    ]).then(($$result) => {
        const to = $$result[0];
        const asyncValue = $$result[1];
        const mailSubject = $$result[2];
        const action = $$result[3].label;
        const titleValues = $$result[4];
        const contentValues = $$result[5];
        const customValues = $outputConfig.mailData.customValues;

        let date = new Date();

        date = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

        if (Array.isArray(to)) {
            console.log("Sending email batch to " + to.length + " adresses...");
            let destByLanguage = {};
            let recetteMailCount = 0;
            let languageFound = undefined;
            to.forEach((_dest, _index) => {
                languageFound = _dest.language;
                if(IsRecetteMail(_dest.mailAddress)){
                    console.log("Skipping recette mail :" + _dest.mailAddress);
                    recetteMailCount++;
                } else {
                    const language = _dest.language || "fr";
                    destByLanguage[language] = destByLanguage[language] || [];
                    destByLanguage[language].push(_dest);
                }
            });
            if (recetteMailCount > 0) {
                console.log("Skipped " + recetteMailCount + "/" + to.length + " for " + languageFound);
            }

            pSendToDestByLanguageRec(destByLanguage, 0, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, $outputConfig);
        } else {
            if(IsRecetteMail(to.mailAddress)) {
                console.log("Skipping recette mail :" + to.mailAddress);
            } else {
                pSendToDest(to, $outputConfig, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, $outputConfig, 0);
            }
        }
    }).catch((error) => {
        console.error(`something failed while retrieving the data needed to contruct the notification mail${error}`);
    });
}

function pSendToDestByLanguageRec($destByLanguage, $langIndex, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, $outputConfig, destSent) {
    const langKeys = Object.keys($destByLanguage);
    destSent = destSent || 0;

    if ($langIndex < langKeys.length) {
        const lang = langKeys[$langIndex];
        console.log("\t sending " + $destByLanguage[lang].length + " mails in " + lang + " language");
        const allPromisesArray = $destByLanguage[lang].map((_dest, $destIndex) => {
            return pSendToDest(_dest, $outputConfig, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, 100 * ($destIndex + destSent));
        });

        return Q.allSettled(allPromisesArray).then(() => {
            return pSendToDestByLanguageRec($destByLanguage, $langIndex + 1, $targetObjectId, smtpTransport, asyncValue, mailSubject, action, titleValues, contentValues, customValues, date, $outputConfig, $destByLanguage[lang].length);
        });
    }
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


// Return an array of rules from $rules that match this event and this object, null if no rule match
function _ruleMatchingEvent($strategies, $event, $object) {
    let i, eventRules, found, k, eKey,
        objectRules,
        ret = [],
        countVerified,
        countCriterias;

    // For each rule
    for (k in $strategies) {
        if ($strategies.hasOwnProperty(k)) {
            countVerified = 0;
            countCriterias = 0;
            eventRules = $strategies[k].filters.event;
            objectRules = $strategies[k].filters.object;

            // Verify the matching for each statement in event
            if (eventRules) {
                for (eKey in eventRules) {
                    if (eventRules.hasOwnProperty(eKey)) {
                        if (Array.isArray($event[eKey])) {
                            // If the rule contains a "or" clause check if one of the value match in the rule array is included in the event array
                            if (eventRules[eKey].or) {
                                found = false;
                                for (i = 0; i < eventRules[eKey].or.length; i++) {
                                    if ($event[eKey].indexOf(eventRules[eKey].or[i]) !== -1) {
                                        found = true;
                                    }
                                }
                                if (found) {
                                    countVerified++;
                                }
                            } else if (eventRules[eKey].and) {
                                found = true;
                                for (i = 0; i < eventRules[eKey].and.length; i++) {
                                    if ($event[eKey].indexOf(eventRules[eKey].and[i]) === -1) {
                                        found = false;
                                    }
                                }
                                if (found) {
                                    countVerified++;
                                }
                            } else if ($event[eKey].indexOf(eventRules[eKey]) !== -1) {
                                countVerified++;
                            }
                        } else if (eventRules[eKey] && $event[eKey] && eventRules[eKey] === $event[eKey]) {
                            countVerified++;
                        }
                        countCriterias++;
                    }
                }
            }

            // verify the matching for each statement in object
            if(typeof objectRules === "function") {
                const isVerified = objectRules($object, $event);
                if (isVerified){countVerified++;}
                countCriterias++;
            } else if (objectRules) {
                for (let oKey in objectRules) {
                    if (objectRules.hasOwnProperty(oKey)) {
                        if (Array.isArray($object[oKey])) {
                            if ($object[oKey].indexOf(objectRules[oKey]) !== -1) {
                                countVerified++;
                            }
                        } else if (objectRules[oKey] !== undefined && $object[oKey] !== undefined && objectRules[oKey] === $object[oKey]) {
                            countVerified++;
                        }
                        countCriterias++;
                    }
                }
            }
            //console.log("evalMatch", k, countVerified, countCriterias)
            if (countVerified > 0 && countVerified === countCriterias) {
                //console.log("+++++MATCH =>", k)
                ret.push(k);
            }
        }
    }

    return ret;
}

module.exports = {
    _overloadHtmlRef,
    _ruleMatchingEvent,
    mailError,
    sendAdminEmail,
    _sendMail,
    _createHtmlTemplate,
    _pGetAllMail,
    _pGetMailFromAccountId,
    textToExtract
};


