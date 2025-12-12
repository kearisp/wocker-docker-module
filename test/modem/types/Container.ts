export type Container = {
    Id: string;
    Name: string;
    Image: string;
    State: {
        Status: string;
        Running: boolean;
    };
    Created: number;
};
