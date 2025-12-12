export type Image = {
    Id: string;
    RepoTags: string[];
    ParentId?: string;
    Labels: {
        [name: string]: string;
    };
};
